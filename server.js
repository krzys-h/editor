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

var applyOperation = function(file, operation)
{
	if(operation.version < file.version) {
		console.error("Dropped operation, bad version (TODO)", operation);
		return false;
	}
	if(typeof operation.insert !== 'undefined') {
		file.content = [file.content.slice(0, operation.position), operation.insert, file.content.slice(operation.position)].join('');
		file.version++;
	} else if(typeof operation.remove !== 'undefined') {
		file.content = [file.content.slice(0, operation.position), file.content.slice(operation.position+operation.remove)].join('');
		file.version++;
	}
	return true;
}

var cursors = {};
io.sockets.on('connection', function(socket) {
	var user = Math.random().toString(36).slice(2);
	console.log("connected - "+user);
	var edited_file;

	socket.emit('filelist', Object.keys(files));

	socket.on('open', function(filename, callback) {
		socket.join(filename);
		edited_file = filename;
		if(typeof files[filename] === 'undefined') {
			files[filename] = {
				version: 0,
				content: ""
			};
			io.sockets.emit('filelist', Object.keys(files));
		}
		for(var otheruser in cursors) {
			if(!cursors.hasOwnProperty(otheruser)) continue;
			if(cursors[otheruser].file != edited_file) continue;
			socket.emit('cursor', {user: otheruser, cursor: cursors[otheruser].cursor});
		}
		callback({version: files[filename].version, content: files[filename].content});
	});

	socket.on('close', function() {
		socket.broadcast.emit('cursorremove', user);
		delete cursors[user];
		socket.leave(edited_file);
		delete edited_file;
	});
	
	socket.on('delete', function(filename) {
		io.sockets.to(filename).emit('close');
		fs.unlinkSync('./storage/'+filename);
		delete files[filename];
		io.sockets.emit('filelist', Object.keys(files));
	});

	socket.on('post', function(operation, callback) {
		if(applyOperation(files[edited_file], operation)) {
			callback({success: true, version: files[edited_file].version});
			socket.broadcast.to(edited_file).emit('operation', operation);
		} else {
			callback({success: false});
		}
	});

	socket.on('cursor', function(cursor) {
		cursors[user] = {cursor: cursor, file: edited_file};
		socket.broadcast.to(edited_file).emit('cursor', {user: user, cursor: cursor});
	});

	socket.on('disconnect', function() {
		socket.broadcast.emit('cursorremove', user);
		delete cursors[user];
		console.log("Disconnected - "+user);
	});
});
