var SshClient = require('simple-ssh');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');
var Datastore = require('nedb'),
	db = new Datastore();

io.on('connection', function(socket){
  console.log('a user connected');
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