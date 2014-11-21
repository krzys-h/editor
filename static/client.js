var version;
var content;
var loaded = false;
var Range = ace.require('ace/range').Range;

var success_cb = function(data) {
	if(!data.success) {
		console.error("Operation dropped", data);
		document.getElementById("error").style.display = "block";
		document.getElementById("error").innerHTML = "Operation dropped (TODO)<br>Please refresh";
	} else version = data.version;
}

var translatePosition = function(pos) {
	var p = 0;
	for(var i=0; i<pos.row; i++) p += editor.getSession().getLine(i).length+1;
	p += pos.column;
	return p;
}

var translatePositionBack = function(pos) {
	var p = {row: 0, column: 0};
	for(var i=0; editor.getSession().getLine(i).length < pos; i++) {
		p.row ++;
		pos -= editor.getSession().getLine(i).length+1;
	}
	p.column = pos;
	return p;
}

var applyOperation = function(operation)
{
	loaded = false;
	console.log(operation);
	if(typeof operation.insert !== 'undefined') {
		editor.getSession().insert(translatePositionBack(operation.position), operation.insert);
	} else if(typeof operation.remove !== 'undefined') {
		var start = translatePositionBack(operation.position);
		var end = translatePositionBack(operation.position+operation.remove);
		editor.getSession().remove(new Range(start.row, start.column, end.row, end.column));
	}
	version = operation.version+1;
	loaded = true;
}

var editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.getSession().setMode("ace/mode/text");
editor.getSession().on('change', function(e) {
	if(!loaded || typeof filename == 'undefined') return;
	console.log(e.data);
	switch(e.data.action) {
		case "insertText":
			socket.emit('post', {version: version++, position: translatePosition(e.data.range.start), insert: e.data.text}, success_cb);
		break;

		case "removeText":
			socket.emit('post', {version: version++, position: translatePosition(e.data.range.start), remove: e.data.text.length}, success_cb);
		break;

		case "insertLines":
			var t = "";
			for(var i=0; i<e.data.lines.length; i++) t += e.data.lines[i]+"\n";
			socket.emit('post', {version: version++, position: translatePosition(e.data.range.start), insert: t}, success_cb);
		break;

		case "removeLines":
			var l = 0;
			for(var i=0; i<e.data.lines.length; i++) l += e.data.lines[i].length+1;
			socket.emit('post', {version: version++, position: translatePosition(e.data.range.start), remove: l}, success_cb);
		break;
	}
});
editor.getSession().selection.on('changeCursor', function(e) {
	if(!loaded || typeof filename == 'undefined') return;
	socket.emit('cursor', editor.selection.getCursor());
});

var socket = io.connect();

var extension = function(fname) {
	var fileSplit = fname.split('.');
	var fileExt = '';
	if (fileSplit.length > 1) {
		fileExt = fileSplit[fileSplit.length - 1];
	}
	return fileExt;
};

var ext_map = {};
ext_map["php"] = "php";
ext_map["html"] = "html";
ext_map["htm"] = "html";
ext_map["js"] = "javascript";
ext_map["json"] = "json";
ext_map["sql"] = "mysql";

var filename;
var openFile = function(fname)
{
	if(fname == filename) return;
	
	if(typeof filename !== 'undefined')
	{
		closeFile();
	}
	
	filename = fname;
	
	for(var otheruser in cursors) {
		if(!cursors.hasOwnProperty(otheruser)) continue;
		editor.getSession().removeMarker(cursors[otheruser]);
		delete cursors[otheruser];
	}
	
	socket.emit('open', filename, function(response) {
		loaded = false;
		version = response.version;
		content = response.content;
		editor.getSession().setValue(content);
		var ext = extension(filename);
		if(typeof ext !== 'undefined' && typeof ext_map[ext] !== 'undefined') {
			editor.getSession().setMode("ace/mode/"+ext_map[ext]);
		} else {
			editor.getSession().setMode("ace/mode/text");
		}
		console.log("Editor started for file "+filename+" with document version "+version);
		loaded = true;

		document.getElementById("error").style.display = "none";
		document.getElementById("error").innerHTML = "";
		document.getElementById("editor").style.display = "block";
	});
};
var newFile = function() {
	fname = prompt("Filename");
	if(fname != null) {
		openFile(fname);
	}
}

var closeFile = function() {
	for(var otheruser in cursors) {
		if(!cursors.hasOwnProperty(otheruser)) continue;
		editor.getSession().removeMarker(cursors[otheruser]);
		delete cursors[otheruser];
	}
	socket.emit('close');
	document.getElementById("editor").style.display = "none";
}

var deleteFile = function(fname) {
	if(confirm("Are you sure you want to delete file "+fname+"?")) {
		socket.emit('delete', fname);
	}
}

var loginButton = function() {
	var pw = prompt("Password");
	if(pw != null) {
		socket.emit('login', pw, function() {
			if(confirm("Save password?")) {
				localStorage.password = pw;
			}
		});
	}
}

socket.on('reconnect', function() {
	var fname = filename;
	delete filename;
	openFile(fname);
});

socket.on('filelist', function(filelist) {
	$('#fileselect > table').empty();
	for(var i=0; i<filelist.length; i++) {
		$('#fileselect > table').append('<tr><td><span class="filename"><a href="#" onclick="openFile(\''+filelist[i]+'\')">'+filelist[i]+'</a></span><span class="action"><a href="#" onclick="deleteFile(\''+filelist[i]+'\')" class="btn btn-default"><span class="glyphicon glyphicon-trash"></span></a></span></tr>');
	}
	$('#fileselect > table').append('<tr><td><span class="filename"><i>New file</i></span><span class="action"><a href="#" onclick="newFile()" class="btn btn-default"><span class="glyphicon glyphicon-file"></span></a></span></td></tr>');
});

socket.on('operation', function(operation) {
	applyOperation(operation);
});

socket.on('close', function() {
	closeFile();
});

socket.on('editmode', function(mode) {
	editor.setReadOnly(!mode);
	document.styleSheets[0].addRule(".action", "display: "+(mode ? "inline" : "none")); // TODO: Better solution?
	if(!mode) {
		if(typeof localStorage.password !== 'undefined') {
			socket.emit('login', localStorage.password);
		}
	}
	document.getElementById("login").style.display = mode ? "none" : "block";
});

var cursors = {};
socket.on('cursor', function(data) {
	if(typeof cursors[data.user] !== "undefined")
		editor.getSession().removeMarker(cursors[data.user]);
	cursors[data.user] = editor.getSession().addMarker(new Range(data.cursor.row, data.cursor.column, data.cursor.row, data.cursor.column+1), "ace_cursor", data.user);
});
socket.on('cursorremove', function(user) {
	if(typeof cursors[user] == 'undefined') return;
	editor.getSession().removeMarker(cursors[user]);
	delete cursors[user];
});
socket.on('disconnect', function() {
	for(var otheruser in cursors) {
		if(!cursors.hasOwnProperty(otheruser)) continue;
		editor.getSession().removeMarker(cursors[otheruser]);
		delete cursors[otheruser];
	}

	document.getElementById("error").style.display = "block";
	document.getElementById("error").innerHTML = "Connection lost";
});
