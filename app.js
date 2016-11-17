if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
}

var SshClient = require('simple-ssh');
var express = require('express');
var _ = require('lodash');
var childProcess = require('child_process');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');
var Q = require('q');
var crypto = require('crypto');
var request = require('request');
var bcrypt = require('bcrypt-nodejs');
var Datastore = require('nedb');

process.on('uncaughtException', function(err) {
    console.error('Uncaught Exception:', (err && err.stack) ? err.stack : err);
    process.exit(1);
});

process.on('unhandledRejection', function(err) {
    console.error('Unhandled Rejection:', (err && err.stack) ? err.stack : err);
    process.exit(1);
});

[
    ['warn',  '\x1b[33m'],
    ['error', '\x1b[31m'],
    ['info',   '\x1b[35m'],
    ['log',   '\x1b[2m']
].forEach(function(pair) {
    var method = pair[0], reset = '\x1b[0m', color = '\x1b[36m' + pair[1];
    console[method] = console[method].bind(console, color, method.toUpperCase(), reset);
});

//Configurations
var LOGIN_ATTEMPTS_LOCK = 5, //Amount of times a login attempt can be made before the account is locked.
    LOGIN_LOCK_TIME = 10; //Time that an account is locked in minutes.

var db = {};
db.projects = new Datastore({
    filename: './data/projects.db',
    autoload: true
});
db.logs = new Datastore({
    filename: './data/logs.db',
    autoload: true
});
db.users = new Datastore({
    filename: './data/users.db',
    autoload: true
});
db.sessions = new Datastore({
    filename: './data/sessions.db',
    autoload: true
});

if (process.env.NODE_ENV !== 'development') {
    //Clear all sessions.
    db.sessions.remove({}, function(err) {
        if (err) {
            console.error('Failed to clear sessions:', err);
        }
    });
}

//Find projects that are stuck as running.
db.projects.find({status: 'running'}, function(err, projects) {
    if (err) {
        console.error('Failed to get projects on startup:', err);
    } else {
        _.forEach(projects, function(project) {
            updateProjectStatus(null, project._id, 'failed', 'PupDeploy server crashed or was shutdown during deployment.', project.executions);
        });
    }
});

var setupMode = false;
db.users.count({}, function(err, count) {
    if (err) {
        console.error('Failed to get users on startup:', err);
    } else {
        if (count <= 0) {
            setupMode = true;
        }
    }

    init();
});

function slackRequest(url, data) {
    var defer = Q.defer();

    request.post({
        url: url,
        body: data,
        json: true,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    }, function (err, res, body) {
        if (err) {
            console.error('Slack request failed:', url, err);
            defer.reject(err);
        } else {
            if (body.warning) {
                console.warn('Slack request returned a warning:', body.warning);
            }

            if (body) {
                if (body === 'ok' || body.ok) {
                    console.info('Slack response:', body);
                    defer.resolve(body);
                } else {
                    console.error('Slack request returned an error:', body);
                    defer.reject(body.error);
                }
            } else {
                console.warn('Slack request returned an empty body.');
                defer.resolve();
            }
        }
    });

    return defer.promise;
}

function bsgRequest(path, data) {
    var defer = Q.defer();

    request.post({
        url: 'https://pupdeploy.bombsightgames.com/api' + path,
        body: data,
        json: true,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    }, function (err, res, body) {
        if (err) {
            console.error('BSG request failed:', path, err);
            defer.reject(err);
        } else {
            if (body.warning) {
                console.warn('BSG request returned a warning:', body.warning);
            }

            if (body) {
                if (body === 'ok' || body.ok) {
                    console.info('BSG response:', body);
                    defer.resolve(body);
                } else {
                    console.error('BSG request returned an error:', body);
                    defer.reject(body.error);
                }
            } else {
                console.warn('BSG request returned an empty body.');
                defer.resolve();
            }
        }
    });

    return defer.promise;
}

function sendProjectNotifications(id, types, title, text, pretext, color, link) {
    db.projects.findOne({_id: id}, function(err, project) {
        if (err) {
            console.error('Failed to get project for notification sending:', err);
        } else {
            if (project) {
                if (project.settings.enableNotifications) {
                    _.forEach(project.notifications, function (notification) {
                        console.info('Sending notification:', project.name, notification.type, title, text);
                        if (notification.type === 'slack') {
                            slackRequest(notification.slack.incoming_webhook.url, {
                                attachments: [
                                    {
                                        fallback: title + ': ' + text,
                                        color: color,
                                        pretext: pretext,
                                        title: title,
                                        title_link: link,
                                        text: text,
                                        ts: Date.now() / 1000
                                    }
                                ]
                            }).catch(function (err) {
                                console.error('Failed to send notification:', project.name, notification.type, title, text, err);
                            });
                        } else if (notification.type === 'email') {
                            //TODO: Email notifications.
                        } else if (notification.type === 'web') {
                            var type = 'info';
                            if (text.includes('Succeeded')) {
                                type = 'success';
                            } else if (text.includes('Failed')) {
                                type = 'error';
                            }

                            io.emit('notification', {
                                type: type,
                                message: '<b>' + title + '</b><br>' + text,
                                options: {
                                    ttl: 15000
                                }
                            });
                        } else if (notification.type === 'postToUrl') {
                            //TODO: Post URL notifications.
                        }
                    });
                }
            } else {
                console.error('Failed to find project for notification sending.');
            }
        }
    });
}

function updateProjectLog(projectId, execution, status, error, logs, trigger) {
    var data = {
        $set: {
            projectId: projectId,
            execution: execution,
            status: status,
            error: error,
            updated: Date.now()
        }
    };

    if (logs) {
        data.$set.logs = logs;
    }

    if (trigger) {
        data.$set.trigger = trigger;
    }

    db.logs.update({projectId: projectId, execution: execution}, data, {upsert: true, multi: false}, function(err) {
        if (err) {
            console.error('Failed to update project logs:', err);
        } else {
            if (!logs) {
                io.emit('log_status', {
                    projectId: projectId,
                    execution: execution,
                    status: status,
                    error: error
                });
            }
        }
    });
}

function updateProjectStatus(socket, id, status, error, executions) {
    var data = {$set: {status: status, error: error, updated: Date.now()}};
    if (executions) {
        data.$set.executions = executions;
    }
    db.projects.update({_id: id}, data, {multi: false, returnUpdatedDocs: true}, function(err, affected, project) {
        if (err) {
            console.error('Failed to update project status:', err);
        } else {
            io.emit('project_status', {
                project: id,
                status: status,
                error: error
            });

            if (executions) {
                updateProjectLog(id, executions, status, error, null, socket ? socket.session.username : null);
            }

            if (status == 'running') {
                sendProjectNotifications(project._id, null, project.name + ' Deployment Status', 'Running', 'Project deployment triggered' + (socket ? ' by "' + socket.session.username + '".' : ' automatically.'), '#478dff', null);
            } else if (status === 'succeeded') {
                sendProjectNotifications(project._id, null, project.name + ' Deployment Status', 'Succeeded', null, '#36a64f', null);
            } else if (status === 'failed') {
                sendProjectNotifications(project._id, null, project.name + ' Deployment Status', 'Failed\n' + error, null, '#e50b0b', null);
            }
        }
    });
}

function updateUser(id, username, password, email, superadmin) {
    var defer = Q.defer();

    db.users.count({username: username}, function(err, count) {
        if (err) {
            console.error('Failed to get user count for update user:', err);
            defer.reject('Failed to save user.');
        } else {
            if (!id && count > 0) {
                defer.reject('A user with that username already exists.');
            } else {
                var user = {
                    email: email
                };

                if (!id) {
                    user.username = username;
                }

                if (password) {
                    user.password = bcrypt.hashSync(password);
                }

                if (superadmin) {
                    user.superadmin = true;
                }

                if (id) {
                    user = {$set: user};
                }

                db.users.update({_id: id}, user, {upsert: true}, function(err, user) {
                    if (err) {
                        console.error('Failed to update user:', err);
                        defer.reject('Failed to save user.');
                    } else {
                        defer.resolve(user);
                    }
                });
            }
        }
    });

    return defer.promise;
}

function init() {
    io.use(function(socket, next){
        var token = socket.handshake.query.token;
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

    io.on('connection', function(socket){
        socket.emit('user', socket.session);

        socket.on('project_run', function(id, cb) {
            db.projects.findOne({_id: id}, function(err, project) {
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

        socket.on('project_get', function(id, cb) {
            db.projects.findOne({_id: id}, function(err, project) {
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

        socket.on('project_logs', function(id, cb) {
            db.logs.find({projectId: id}).sort({execution: -1}).limit(20).exec(function(err, logs) {
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

        socket.on('project_log', function(data, cb) {
            db.logs.findOne({projectId: data.projectId, execution: data.execution}, function(err, log) {
                if (err) {
                    console.error('Failed to get log:', err);
                    cb('Failed to get log.');
                } else {
                    cb(null, log);
                }
            });
        });

        socket.on('project_delete', function(id, cb) {
            db.projects.remove({_id: id}, function(err) {
                if (err) {
                    console.error('Failed to delete project:', err);
                    cb('Failed to delete project.');
                } else {
                    cb();
                }
            });
        });

        socket.on('project_list', function(data, cb) {
            db.projects.find({}, function(err, projects) {
                if (err) {
                    console.error('Failed to get projects:', err);
                    cb('Failed to get projects.');
                } else {
                    cb(null, projects);
                }
            });
        });

        socket.on('project_update', function(data, cb) {
            var steps = [];
            _.forEach(data.steps, function(step) {
                steps.push({
                    commands: step.commands
                });
            });

            var servers = [];
            _.forEach(data.servers, function(server) {
                servers.push({
                    host: server.host
                });
            });

            var triggers = [];
            _.forEach(data.triggers, function(trigger) {
                triggers.push({
                    type: trigger.type,
                    hash: trigger.hash
                });
            });

            var notifications = [];
            _.forEach(data.notifications, function(notification) {
                notifications.push({
                    type: notification.type,
                    slack: notification.slack
                });
            });

            var project = {
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
            }, function(err) {
                if (err) {
                    console.error('Failed to create project:', err);
                    cb('Failed to create project.');
                } else {
                    cb();
                }
            });
        });

        socket.on('user_get', function(id, cb) {
            db.users.findOne({_id: id}, function(err, user) {
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

        socket.on('user_delete', function(id, cb) {
            if (!socket.session.superadmin) {
                return cb('Only the super admin can delete users.');
            }

            db.users.findOne({_id: id}, function(err, user) {
                if (err) {
                    console.error('Failed to get user for deletion:', err);
                } else {
                    if (user) {
                        if (user.superadmin) {
                            cb('Cannot delete super admin user.');
                        } else {
                            db.users.remove({_id: id}, function(err) {
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

        socket.on('user_list', function(data, cb) {
            db.users.find({}, function(err, users) {
                if (err) {
                    console.error('Failed to get users:', err);
                    cb('Failed to get users.');
                } else {
                    var filteredUsers = [];

                    _.forEach(users, function(user) {
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

        socket.on('user_update', function(data, cb) {
            if (!socket.session.superadmin && socket.session.userId !== data._id) {
                return cb('Only the super admin can edit other users.');
            }

            db.users.findOne({_id: data._id}, function(err, user) {
                if (err) {
                    console.error('Failed get user for update:', err);
                    cb('Failed to update user.');
                } else {
                    if (user && user.superadmin && !socket.session.superadmin) {
                        return cb('Only the super admin can edit theirself.');
                    }

                    updateUser(data._id, data.username, data.password, data.email).then(function() {
                        cb();
                    }, function(err) {
                        cb(err);
                    });
                }
            });
        });
    });

    app.use(bodyParser.json());
    app.post('/login', function(req, res) {
        db.users.findOne({username: req.body.username}, function(err, user) {
            if (err) {
                console.error('Failed to get user for login:', err);
                res.send({success: false, message: 'Server error, failed to login.'});
            } else {
                if (user) {
                    if (user.lock > Date.now()) {
                        res.send({success: false, message: 'This account has been locked for ' + LOGIN_LOCK_TIME + ' minutes because of too many failed login attempts.'});
                    } else {
                        if (bcrypt.compareSync(req.body.password, user.password)) {
                            crypto.randomBytes(64, function(err, buffer) {
                                if (err) {
                                    console.error('Failed to generate token for session:', err);
                                    res.send({success: false, message: 'Server error, failed to login.'});
                                } else {
                                    var token = buffer.toString('hex');

                                    db.sessions.insert({
                                        _id: token,
                                        userId: user._id,
                                        username: user.username,
                                        email: user.email,
                                        superadmin: user.superadmin
                                    }, function(err, session) {
                                        if (err) {
                                            console.error('Failed to create session:', err);
                                            res.send({success: false, message: 'Server error, failed to login.'});
                                        } else {
                                            console.log('User "' + user.username + '" logged in.');
                                            res.send({success: true, token: session._id});
                                        }
                                    });
                                }
                            });
                        } else {
                            if (user.attempts >= LOGIN_ATTEMPTS_LOCK) {
                                db.users.update({_id: user._id}, {$set: {attempts: 0, lock: Date.now() + (LOGIN_LOCK_TIME*60*1000)}}, function(err) {
                                    if (err) {
                                        console.error('Failed to set lock for failed login:', err);
                                        res.send({success: false, message: 'Server error, failed to login.'});
                                    } else {
                                        console.warn('Account "' + user.username + '" locked for ' + LOGIN_LOCK_TIME + ' minutes because of too many failed login attempts from: ' + (req.headers['x-forwarded-for'] || req.connection.remoteAddress));
                                        res.send({success: false, message: 'This account has been locked for ' + LOGIN_LOCK_TIME + ' minutes because of too many failed login attempts.'});
                                    }
                                });
                            } else {
                                if (Date.now() >= user.lastLoginAttempt + (LOGIN_LOCK_TIME*60*1000)) {
                                    db.users.update({_id: user._id}, {$set: {attempts: 1, lastLoginAttempt: Date.now()}}, function(err) {
                                        if (err) {
                                            console.error('Failed to set login attempts:', err);
                                            res.send({success: false, message: 'Server error, failed to login.'});
                                        } else {
                                            res.send({success: false, message: 'Invalid username or password.'});
                                        }
                                    });
                                } else {
                                    db.users.update({_id: user._id}, {$inc: {attempts: 1}, $set: {lastLoginAttempt: Date.now()}}, function(err) {
                                        if (err) {
                                            console.error('Failed to increment login attempts:', err);
                                            res.send({success: false, message: 'Server error, failed to login.'});
                                        } else {
                                            res.send({success: false, message: 'Invalid username or password.'});
                                        }
                                    });
                                }
                            }
                        }
                    }
                } else {
                    res.send({success: false, message: 'Invalid username or password.'});
                }
            }
        });
    });

    app.post('/trigger/:hash', function(req, res) {
        var hash = req.params.hash;
        if (hash) {
            db.projects.findOne({triggers: {$elemMatch: {hash: hash}}}, function(err, project) {
                if (err) {
                    console.error('Error triggering project:', hash, err);
                    res.send({success: false, message: 'Server error.'});
                } else {
                    if (project && project.settings.enableTriggers) {
                        runProject(null, project);
                        res.send({success: true});
                    } else {
                        res.send({success: false, message: 'Invalid trigger.'});
                    }
                }
            });
        } else {
            res.send({success: false, message: 'Invalid trigger.'});
        }
    });

    //TODO: Get session for verification.
    app.get('/slack', function(req, res) {
        if (req.query) {
            if (req.query.error) {
                console.error('Slack setup error:', req.query.error);
                res.send('<script>window.close();</script>');
            } else {
                var tryForToken = function(protocol) {
                    var defer = Q.defer();

                    bsgRequest('/token', {
                        code: req.query.code,
                        redirect: 'https://pupdeploy.bombsightgames.com/api/' + protocol + '://' + req.get('host') + '/slack'
                    }).then(function(data) {
                        io.emit('slack_setup', {
                            token: req.query.state,
                            slack: data
                        });
                        res.send('<script>window.close();</script>');
                        defer.resolve();
                    }, function(err) {
                        defer.reject(err);
                    });

                    return defer.promise;
                };

                //Try for token with HTTP and HTTPS.
                //In the case that the server is behind a proxy we can't trust the req.protocol value unless X-Forwarded-Proto is set up.
                tryForToken('http').catch(function(err) {
                    return tryForToken('https');
                }).catch(function(err) {
                    io.emit('slack_setup', {
                        error: 'Failed to setup Slack.',
                        token: req.query.state
                    });
                    res.send('<script>window.close();</script>');
                });
            }
        } else {
            res.redirect('/');
        }
    });

    app.post('/setup', function(req, res) {
        if (setupMode) {
            if (req.body.admin) {
                var admin = req.body.admin;
                updateUser(null, admin.username, admin.password, admin.email, true).then(function() {
                    setupMode = false;
                    res.send({success: true});
                }, function(err) {
                    res.send({success: false, message: err});
                });
            } else {
                res.send({success: false, message: 'Invalid data.'});
            }
        } else {
            res.send({success: false, message: 'Server is not in setup mode.'});
        }
    });

    app.use(function (req, res, next) {
        res.cookie('pdsetup', setupMode, {maxAge: 90000});
        next();
    });
    app.use(express.static('public'));
    app.use(function(req, res, next){
        res.sendFile(__dirname + '/public/index.html');
    });

    http.listen(3000, function () {
        console.log('Listening on port 3000.');
    });

    function runProject(socket, project) {
        var executions = project.executions ? project.executions : 0;
        var logs = {};
        executions++;
        updateProjectStatus(socket, project._id, 'running', null, executions);

        var error = false,
            index = 0,
            serverIndex = 0,
            run = true,
            steps = null,
            servers = project.servers.slice(0),
            server = null;
        function runNextStep() {
            index++;
            if (run && (!steps || steps.length <= 0) && servers.length > 0) {
                server = servers.shift();
                server.index = serverIndex;
                serverIndex++;
                steps = project.steps.slice(0);
                index = 0;
            } else if (!run || (servers.length <= 0 && steps.length <= 0)) {
                if (error) {
                    updateProjectStatus(socket, project._id, 'failed', server.host + ': One or more steps exited with a non-zero code.', executions);
                } else {
                    updateProjectStatus(socket, project._id, 'succeeded', null, executions);
                }

                return;
            }

            console.log("RUNNING STEP", server.host, index);

            var step = steps.shift();

            var options = {
                host: server.host,
                user: project.auth.username
            };

            if (project.auth.type == 'password') {
                options.pass = project.auth.password;
            } else if (project.auth.type == 'key') {
                options.key = project.auth.key;
            } else {
                updateProjectStatus(socket, project._id, 'failed', server.host + ': Invalid authentication type.', executions);
                return;
            }

            function stepRun(data) {
                io.emit('step_run', data);

                data.output += '\n';

                var server = logs[data.server.index];
                if (server) {
                    data.server = null;
                    if (server.logs[data.index] ) {
                        server.logs[data.index].output += data.output;
                    } else {
                        server.logs[data.index] = data;
                    }
                } else {
                    server = data.server;
                    data.server = null;
                    server.logs = {};
                    server.logs[data.index] = data;
                }

                logs[server.index] = server;
                updateProjectLog(project._id, executions, project.status, project.error, logs);
            }

            function addNextStep(index) {
                var sIndex = serverIndex-1;
                if (index >= project.steps.length) {
                    index = 0;
                }

                var nextStep = project.steps[index];
                if (nextStep && sIndex <= project.servers.length-1) {
                    if (!logs[sIndex]) {
                        logs[sIndex] = {
                            index: sIndex,
                            host: project.servers[sIndex].host,
                            logs: {}
                        };
                    }

                    logs[sIndex].logs[index] = {
                        project: project._id,
                        index: index,
                        step: project.steps[index],
                        output: '',
                        type: 'out'
                    };
                }
            }

            function stepEnd(data) {
                io.emit('step_end', data);

                if (logs[data.server.index]) {
                    logs[data.server.index].logs[data.index].code = data.code;
                } else {
                    var index = data.server.index;
                    logs[data.server.index] = data.server;
                    data.server = null;
                    logs[index].logs = {};
                    logs[index].logs[data.index] = data;
                }

                if (data.code == 0 || !project.settings.haltOnFailure) {
                    addNextStep(data.index + 1);
                }

                updateProjectLog(project._id, executions, project.status, project.error, logs);
            }

            var ssh = new SshClient(options);

            ssh.on('error', function(err) {
                console.error('SSH Error:', err);
                stepEnd({
                    project: project._id,
                    index: index,
                    step: step,
                    server: server,
                    code: 1
                });
                var message = server.host + ': ' + err.level;
                if (err.code) {
                    message += ' - ' + err.code;
                }
                if (err.message) {
                    message += ' - ' + err.message;
                }
                updateProjectStatus(socket, project._id, 'failed', message, executions);
                run = false;
            });

            ssh.exec(step.commands, {
                out: function(stdout) {
                    console.log('stdout:', stdout);
                    stepRun({
                        project: project._id,
                        index: index,
                        step: step,
                        server: server,
                        output: stdout,
                        type: 'out'
                    });
                },
                err: function(stderr) {
                    console.error('stderr:', stderr);
                    stepRun({
                        project: project._id,
                        index: index,
                        step: step,
                        server: server,
                        output: stderr,
                        type: 'error'
                    });
                },
                exit: function(code) {
                    setTimeout(function() {
                        console.log('Step End:', server.host, index, code);
                        stepEnd({
                            project: project._id,
                            index: index,
                            step: step,
                            server: server,
                            code: code
                        });

                        if (code != 0) {
                            error = true;
                            if (project.settings.haltOnFailure) {
                                run = false;
                            }
                        }

                        setTimeout(function() {
                            runNextStep();
                        }, 500);
                    }, 100);
                }
            });

            try {
                ssh.start();
            } catch (e) {
                console.error('Failed to run SSH command:', e);
                updateProjectStatus(socket, project._id, 'failed', server.host + ': ' + e.message, executions);
            }
        }

        runNextStep();
    }
}