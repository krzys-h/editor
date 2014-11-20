var PORT = 8080;




var fs = require('fs');

var static_files = new (require('node-static').Server)('./static');

var app = require('http').createServer(
	function (req, res) {
		static_files.serve(req, res);
	}
);

var io = require('socket.io').listen(app);

app.listen(PORT);

var files = {};
try {
	var filelist = fs.readdirSync("./storage");
	console.log(filelist);
	
	for(var i=0; i<filelist.length; i++) {
		var filename = filelist[i];
		files[filename] = {
			version: 0,
			content: fs.readFileSync('./storage/'+filename).toString()
		};
	}
} catch(err) {
	fs.mkdirSync("./storage");
	files["hello.txt"] = {
		version: 0,
		content: "krzys_h's live collaborative editor\n===================================\nWelcome!\nType anything in here, and other users will see it!\nOpen this page in another browser window to see it changing live yourself!\n\n"
	};
}

setInterval(function() {
	for(var filename in files) {
		if(!files.hasOwnProperty(filename)) continue;
		fs.writeFileSync('./storage/'+filename, files[filename].content);
	}
}, 1000);

var applyOperation = function(operation)
{
	if(operation.version < files[operation.filename].version) {
		console.error("Dropped operation, bad version (TODO)", operation);
		return false;
	}
	if(typeof operation.insert !== 'undefined') {
		files[operation.filename].content = [files[operation.filename].content.slice(0, operation.position), operation.insert, files[operation.filename].content.slice(operation.position)].join('');
		files[operation.filename].version++;
	} else if(typeof operation.remove !== 'undefined') {
		files[operation.filename].content = [files[operation.filename].content.slice(0, operation.position), files[operation.filename].content.slice(operation.position+operation.remove)].join('');
		files[operation.filename].version++;
	}
	return true;
}

var cursors = {};
io.sockets.on('connection', function(socket) {
	var user = Math.random().toString(36).slice(2);
	console.log("connected - "+user);
	var edited_file;

	for(var otheruser in cursors) {
		if(!cursors.hasOwnProperty(otheruser)) continue;
		socket.emit('cursor', {user: otheruser, cursor: cursors[otheruser]});
	}

	socket.emit('filelist', Object.keys(files));

	socket.on('open', function(filename, callback) {
		socket.join(filename);
		edited_file = filename;
		if(typeof files[filename] === 'undefined') {
			files[filename] = {
				version: 0,
				content: ""
			};
			socket.emit('filelist', Object.keys(files));
		}
		callback({version: files[filename].version, content: files[filename].content});
	});

	socket.on('close', function() {
		socket.leave(edited_file);
		delete edited_file;
	});

	socket.on('post', function(operation, callback) {
		if(applyOperation(operation)) {
			callback({success: true, version: files[operation.filename].version});
			socket.broadcast.to(operation.filename).emit('operation', operation);
		} else {
			callback({success: false});
		}
	});

	socket.on('cursor', function(cursor) {
		cursors[user] = cursor;
		socket.broadcast.emit('cursor', {user: user, cursor: cursor});
	});

	socket.on('disconnect', function() {
		socket.broadcast.emit('cursorremove', user);
		delete cursors[user];
		console.log("Disconnected - "+user);
	});
});
