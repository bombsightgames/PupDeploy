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

//db.projects.persistence.setAutocompactionInterval(10);

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
        db.projects.find({}, function(err, docs) {
            if (err) {
                console.error('Failed to get projects:', err);
                cb('Failed to get projects.');
            } else {
                cb(null, docs);
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

        db.projects.update({
            _id: data._id
        }, {
            name: data.name,
            steps: steps,
            status: 'idle'
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
        index = -1,
        run = true;
    function runNextStep() {
        if (!run) {
            console.log('Stopping project execution.');
            return;
        }

        index++;
        console.log("RUNNING STEP", index);

        if (project.steps.length <= 0) {
            if (error) {
                updateProjectStatus(project._id, 'failed', 'One or more steps exited with a non-zero code.');
            } else {
                updateProjectStatus(project._id, 'succeeded');
            }

            return;
        }

        var step = project.steps.shift();

        var ssh = new SshClient({
            host: '192.168.198.128',
            user: 'root',
            pass: '123123'
        });

        ssh.on('error', function(err) {
            console.error('SSH Error:', err);
            updateProjectStatus(project._id, 'failed', err.level);
            run = false;
        });

        ssh.exec(step.commands, {
            out: function(stdout) {
                console.log('stdout:', stdout);
                socket.emit('step_run', {
                    project: project._id,
                    index: index,
                    step: step,
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
                    output: stderr,
                    type: 'error'
                });
            },
            exit: function(code) {
                console.log('Step End:', code);
                socket.emit('step_end', {
                    project: project._id,
                    index: index,
                    step: step,
                    code: code
                });

                if (code != 0) {
                    error = true;
                }

                runNextStep();
            }
        }).start();
    }

    runNextStep();
}

function runTask(fn) {
    var worker = process.fork();
}
