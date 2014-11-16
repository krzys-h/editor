var file = new (require('node-static').Server)('./static');

var app = require('http').createServer(
	function (req, res) {
		file.serve(req, res);
	}
);

var io = require('socket.io').listen(app);

app.listen(8080);

var version = 0;
var content = "start data";
// sample operation:
// {version: 0, position: 4, insert: 'test'}
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

console.log(version, content);
applyOperation({version: version, position: 5, insert: ' test'});
applyOperation({version: version, position: 0, remove: 5});
applyOperation({version: version, position: 0, insert: 'end'});

io.sockets.on('connection', function(socket) {
	console.log("connected");

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
});
