var SshClient = require('simple-ssh');
var express = require('express');
var _ = require('lodash');
var process = require('child_process');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');
var Datastore = require('nedb');

var db = {};
db.projects = new Datastore({
	filename: './data/projects.db',
    autoload: true
});

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

io.on('connection', function(socket){
    console.log('A user connected.');

    socket.emit('user', {
        username: 'admin'
    });

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
});

app.use(bodyParser.json());
app.post('/login', function(req, res) {
	if (req.body.username === 'admin' && req.body.password === '123123') {
		res.send({success: true, token: 'a43wfwasaf'});
	} else {
		res.send({success: false, message: 'Invalid username or password.'});
	}
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
    var worker = process.fork();
}
