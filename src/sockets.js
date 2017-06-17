const _ = require('lodash');
module.exports = function(io, db, runProject, updateUser) {
    io.use(function(socket, next){
        let token = socket.handshake.query.token;
        if (token) {
            db.sessions.findOne({_id: token}, function(err, session) {
                if (err) {
                    console.error('Failed to get session for socket connection.');
                    next(new Error('server_error'));
                } else {
                    if (session) {
                        db.users.findOne({_id: session.userId}, function(err, user) {
                            if (err) {
                                console.error('Failed to get user for session:', err);
                                next(new Error('server_error'));
                            } else {
                                if (user) {
                                    socket.session = session;
                                    next();
                                } else {
                                    db.sessions.remove({_id: session._id}, function(err) {
                                        if (err) {
                                            console.error('Failed to remove invalid token:', err);
                                        }

                                        next(new Error('invalid_token'));
                                    });
                                }
                            }
                        });
                    } else {
                        next(new Error('invalid_token'));
                    }
                }
            });
        } else {
            next(new Error('invalid_token'));
        }
    });

    io.on('connection', function (socket) {
        socket.emit('user', socket.session);

        socket.on('project_run', function (id, cb) {
            db.projects.findOne({_id: id}, function (err, project) {
                if (err) {
                    console.error('Failed to run project:', err);
                    cb('Failed to run project.');
                } else {
                    if (project) {
                        console.log('Running project:', project.name);
                        runProject(socket, project);
                        cb();
                    } else {
                        cb('Invalid project.');
                    }
                }
            });
        });

        socket.on('project_get', function (id, cb) {
            db.projects.findOne({_id: id}, function (err, project) {
                if (err) {
                    console.error('Failed to get project:', err);
                    cb('Failed to get project.');
                } else {
                    if (project) {
                        project.auth = {
                            type: project.auth.type
                        };
                        cb(null, project);
                    } else {
                        cb('Project not found.');
                    }
                }
            });
        });

        socket.on('project_logs', function (id, cb) {
            db.logs.find({projectId: id}).sort({execution: -1}).limit(20).exec(function (err, logs) {
                if (err) {
                    console.error('Failed to get logs:', err);
                    cb('Failed to get logs.');
                } else {
                    if (logs) {
                        cb(null, logs);
                    } else {
                        cb('Project not found.');
                    }
                }
            });
        });

        socket.on('project_log', function (data, cb) {
            db.logs.findOne({projectId: data.projectId, execution: data.execution}, function (err, log) {
                if (err) {
                    console.error('Failed to get log:', err);
                    cb('Failed to get log.');
                } else {
                    cb(null, log);
                }
            });
        });

        socket.on('project_delete', function (id, cb) {
            db.projects.remove({_id: id}, function (err) {
                if (err) {
                    console.error('Failed to delete project:', err);
                    cb('Failed to delete project.');
                } else {
                    cb();
                }
            });
        });

        socket.on('project_list', function (data, cb) {
            db.projects.find({}, function (err, projects) {
                if (err) {
                    console.error('Failed to get projects:', err);
                    cb('Failed to get projects.');
                } else {
                    cb(null, projects);
                }
            });
        });

        socket.on('project_update', function (data, cb) {
            let steps = [];
            _.forEach(data.steps, function (step) {
                steps.push({
                    commands: step.commands
                });
            });

            let servers = [];
            _.forEach(data.servers, function (server) {
                servers.push({
                    host: server.host
                });
            });

            let triggers = [];
            _.forEach(data.triggers, function (trigger) {
                triggers.push({
                    type: trigger.type,
                    hash: trigger.hash,
                    regex: trigger.regex
                });
            });

            let notifications = [];
            _.forEach(data.notifications, function (notification) {
                notifications.push({
                    type: notification.type,
                    slack: notification.slack
                });
            });

            let project = {
                name: data.name,
                settings: data.settings,
                steps: steps,
                servers: servers,
                triggers: triggers,
                notifications: notifications,
                updated: Date.now()
            };

            if (data.auth && ((data.auth.username && data.auth.password) || data.auth.key)) {
                project.auth = {
                    type: data.auth.type,
                    username: data.auth.username,
                    password: data.auth.password,
                    key: data.auth.key
                };
            }

            if (project.servers.length <= 0) {
                return cb('You must specify at least one server to run this deployment on.');
            }

            db.projects.update({
                _id: data._id
            }, {$set: project}, {
                upsert: true
            }, function (err) {
                if (err) {
                    console.error('Failed to create project:', err);
                    cb('Failed to create project.');
                } else {
                    cb();
                }
            });
        });

        socket.on('server_get', function (id, cb) {
            db.servers.findOne({_id: id}, function (err, server) {
                if (err) {
                    console.error('Failed to get server:', err);
                    cb('Failed to get server.');
                } else {
                    if (server) {
                        let config = {
                            username: server.auth.username,
                            privateKey: server.auth.key,
                            host: server.server,
                            dstHost: '/var/run/docker.sock',
                            dstPort: -2,
                            localPort: 43253,
                            localHost: '127.0.0.1',
                            debug: console.log
                        };

                        let tunnel = require('tunnel-ssh');
                        let tnl = tunnel(config, function (err, server) {
                            if (err) {
                                console.error('Failed to create SSH tunnel:', err);
                            } else {
                                console.log('SSH tunnel connected.', tnl, server);

                                setTimeout(function () {
                                    let Dockerode = require('dockerode');
                                    let docker = new Dockerode({host: 'http://127.0.0.1', port: 43253});
                                    docker.listContainers({all: true}, function (err, containers) {
                                        console.error(err);
                                        console.log('ALL: ' + containers);
                                    });
                                }, 4000);
                            }
                        });

                        server.auth = {
                            type: server.auth.type
                        };
                        cb(null, server);
                    } else {
                        cb('Server not found.');
                    }
                }
            });
        });

        socket.on('server_delete', function (id, cb) {
            db.servers.remove({_id: id}, function (err) {
                if (err) {
                    console.error('Failed to delete server:', err);
                    cb('Failed to delete server.');
                } else {
                    cb();
                }
            });
        });

        socket.on('server_list', function (data, cb) {
            db.servers.find({}, function (err, servers) {
                if (err) {
                    console.error('Failed to get servers:', err);
                    cb('Failed to get servers.');
                } else {
                    cb(null, servers);
                }
            });
        });

        socket.on('server_update', function (data, cb) {
            let server = {
                name: data.name,
                settings: data.settings,
                server: data.server,
                updated: Date.now()
            };

            if (data.auth && ((data.auth.username && data.auth.password) || data.auth.key)) {
                server.auth = {
                    type: data.auth.type,
                    username: data.auth.username,
                    password: data.auth.password,
                    key: data.auth.key
                };
            }

            db.servers.update({
                _id: data._id
            }, {$set: server}, {
                upsert: true
            }, function (err) {
                if (err) {
                    console.error('Failed to create server:', err);
                    cb('Failed to create server.');
                } else {
                    cb();
                }
            });
        });

        socket.on('user_get', function (id, cb) {
            db.users.findOne({_id: id}, function (err, user) {
                if (err) {
                    console.error('Failed to get user:', err);
                    cb('Failed to get user.');
                } else {
                    if (user) {
                        cb(null, {
                            _id: user._id,
                            username: user.username,
                            email: user.email,
                            superadmin: user.superadmin
                        });
                    } else {
                        cb('User not found.');
                    }
                }
            });
        });

        socket.on('user_delete', function (id, cb) {
            if (!socket.session.superadmin) {
                return cb('Only the super admin can delete users.');
            }

            db.users.findOne({_id: id}, function (err, user) {
                if (err) {
                    console.error('Failed to get user for deletion:', err);
                } else {
                    if (user) {
                        if (user.superadmin) {
                            cb('Cannot delete super admin user.');
                        } else {
                            db.users.remove({_id: id}, function (err) {
                                if (err) {
                                    console.error('Failed to delete user:', err);
                                    cb('Failed to delete user.');
                                } else {
                                    cb();
                                }
                            });
                        }
                    } else {
                        cb('User not found.');
                    }
                }
            });
        });

        socket.on('user_list', function (data, cb) {
            db.users.find({}, function (err, users) {
                if (err) {
                    console.error('Failed to get users:', err);
                    cb('Failed to get users.');
                } else {
                    let filteredUsers = [];

                    _.forEach(users, function (user) {
                        filteredUsers.push({
                            _id: user._id,
                            username: user.username,
                            email: user.email,
                            superadmin: user.superadmin
                        });
                    });

                    cb(null, filteredUsers);
                }
            });
        });

        socket.on('user_update', function (data, cb) {
            if (!socket.session.superadmin && socket.session.userId !== data._id) {
                return cb('Only the super admin can edit other users.');
            }

            db.users.findOne({_id: data._id}, function (err, user) {
                if (err) {
                    console.error('Failed get user for update:', err);
                    cb('Failed to update user.');
                } else {
                    if (user && user.superadmin && !socket.session.superadmin) {
                        return cb('Only the super admin can edit theirself.');
                    }

                    updateUser(data._id, data.username, data.password, data.email).then(function () {
                        cb();
                    }, function (err) {
                        cb(err);
                    });
                }
            });
        });
    });
};