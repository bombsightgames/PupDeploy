var SshClient = require('simple-ssh');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var Datastore = require('nedb'),
	db = new Datastore();

io.on('connection', function(socket){
  console.log('a user connected');
});

app.get('/login', function(req, res) {
	console.log('test');
	res.send('wot');
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