var SshClient = require('simple-ssh');
var express = require('express');
var _ = require('lodash');
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
        console.log("PROJECT", data);

        var steps = [];
        _.forEach(data.steps, function(step) {
            steps.push({
                commands: step.commands
            });
        });

        db.projects.insert({
            name: data.name,
            steps: steps
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

 /*
var ssh = new SshClient({
    host: 'localhost.com',
    user: 'brandon',
    pass: '123123'
});
 
ssh.exec('echo $PATH', {
    out: function(stdout) {
        console.log(stdout);
    }
}).start();
*/
