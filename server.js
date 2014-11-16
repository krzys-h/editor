var file = new (require('node-static').Server)('./static');

var app = require('http').createServer(
	function (req, res) {
		file.serve(req, res);
	}
);

var io = require('socket.io').listen(app);

app.listen(8080);

var version = 0;
var content = "";
var applyOperation = function(operation)
{
	if(operation.version < version) {
		console.error("Dropped operation, bad version (TODO)", operation);
		return false;
	}
	if(typeof operation.insert !== 'undefined') {
		content = [content.slice(0, operation.position), operation.insert, content.slice(operation.position)].join('');
		version++;
	} else if(typeof operation.remove !== 'undefined') {
		content = [content.slice(0, operation.position), content.slice(operation.position+operation.remove)].join('');
		version++;
	}
	console.log(version, content);
	return true;
}

io.sockets.on('connection', function(socket) {
	var user = Math.random().toString(36).slice(2);
	console.log("connected - "+user);

	socket.on('get', function(callback) {
		callback({version: version, content: content});
	});

	socket.on('post', function(operation, callback) {
		if(applyOperation(operation)) {
			callback({success: true, version: version});
			socket.broadcast.emit('operation', operation);
		} else {
			callback({success: false});
		}
	});

	socket.on('cursor', function(cursor) {
		socket.broadcast.emit('cursor', {user: user, cursor: cursor});
	});
});
