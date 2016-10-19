var SshClient = require('simple-ssh');
var express = require('express');
var _ = require('lodash');
var childProcess = require('child_process');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');
var Q = require('q');
var bcrypt = require('bcrypt-nodejs');
var Datastore = require('nedb');

process.on('uncaughtException', function(err) {
    console.error('Uncaught Exception:', err.stack ? err.stack : err);
    process.exit(1);
});

process.on('unhandledRejection', function(err) {
    console.error('Unhandled Rejection:', err, err.stack);
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

var db = {};
db.projects = new Datastore({
    filename: './data/projects.db',
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
            updateProjectStatus(project._id, 'failed', 'PupDeploy server crashed or was shutdown during deployment.');
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

function createUser(username, password, email) {
    var defer = Q.defer();

    db.users.count({username: username}, function(err, count) {
        if (err) {
            console.error('Failed to get user count for create user:', err);
            defer.reject('Failed to create user.');
        } else {
            if (count > 0) {
                defer.reject('A user with that username already exists.');
            } else {
                var hash = bcrypt.hashSync(password);

                db.users.insert({
                    username: username,
                    password: hash,
                    email: email
                }, function(err, user) {
                    if (err) {
                        console.error('Failed to create user:', err);
                        defer.reject('Failed to create user.');
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
                        socket.session = session;
                        next();
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
                        cb(null, project);
                    } else {
                        cb('Project not found.');
                    }
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

            db.projects.update({
                _id: data._id
            }, {
                name: data.name,
                steps: steps,
                servers: servers,
                status: 'idle',
                settings: data.settings,
                auth: {
                    username: data.auth.username,
                    type: data.auth.type,
                    password: data.auth.password,
                    key: data.auth.key
                }
            }, {
                upsert: true
            }, function(err, doc) {
                if (err) {
                    console.error('Failed to create project:', err);
                    cb('Failed to create project.');
                } else {
                    cb();
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
                            username: user.username,
                            email: user.email
                        });
                    });

                    cb(null, filteredUsers);
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
                    if (bcrypt.compareSync(req.body.password, user.password)) {
                        db.sessions.insert({
                            userId: user._id,
                            username: user.username,
                            email: user.email
                        }, function(err, session) {
                            if (err) {
                                console.error('Failed to create session:', err);
                                res.send({success: false, message: 'Server error, failed to login.'});
                            } else {
                                console.log('User "' + user.username + '" logged in.');
                                res.send({success: true, token: session._id});
                            }
                        });
                    } else {
                        res.send({success: false, message: 'Invalid username or password.'});
                    }
                } else {
                    res.send({success: false, message: 'Invalid username or password.'});
                }
            }
        });

    });

    app.post('/setup', function(req, res) {
        if (setupMode) {
            if (req.body.admin) {
                var admin = req.body.admin;
                createUser(admin.username, admin.password, admin.email).then(function() {
                    setupMode = false;
                    res.send({success: true});
                }, function(err) {
                    res.send({success: false, message: err});
                });
            } else {
                res.send({success: false, message: 'Invalid data.'});
            }
        } else {
            res.send({success: false, message: 'Server is not in setup mode.'});;
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

    function updateProjectStatus(id, status, error) {
        db.projects.update({_id: id}, {$set: {status: status, error: error}}, function(err) {
            if (err) {
                console.error('Failed to update project status:', err);
            } else {
                io.emit('project_status', {
                    project: id,
                    status: status,
                    error: error
                });
            }
        });
    }

    function runProject(socket, project) {
        updateProjectStatus(project._id, 'running');

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
                    updateProjectStatus(project._id, 'failed', server.host + ': One or more steps exited with a non-zero code.');
                } else {
                    updateProjectStatus(project._id, 'succeeded');
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
                updateProjectStatus(project._id, 'failed', server.host + ': Invalid authentication type.');
                return;
            }

            var ssh = new SshClient(options);

            ssh.on('error', function(err) {
                console.error('SSH Error:', err);
                socket.emit('step_end', {
                    project: project._id,
                    index: index,
                    step: step,
                    server: server,
                    code: 1
                });
                updateProjectStatus(project._id, 'failed', server.host + ': ' + err.level);
                run = false;
            });

            ssh.exec(step.commands, {
                out: function(stdout) {
                    console.log('stdout:', stdout);
                    socket.emit('step_run', {
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
                    socket.emit('step_run', {
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
                        socket.emit('step_end', {
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
                updateProjectStatus(project._id, 'failed', server.host + ': ' + e.message);
            }
        }

        runNextStep();
    }

    function runTask(fn) {
        var worker = childProcess.fork();
    }
}