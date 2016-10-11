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

app.use(express.static('public'));
http.listen(3000, function () {
	console.log('Example app listening on port 3000!');
});