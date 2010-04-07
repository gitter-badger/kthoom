/*
 * thoom.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Jeff Schiller
 *
 */

/* Reference Documentation:

  * File API (FileReader): http://www.w3.org/TR/FileAPI/

*/

if (!window.console) {
	window.console = {};
	window.console.log = function(str) {};
	window.console.dir = function(str) {};
}

if (window.opera) {
	window.console.log = function(str) {opera.postError(str);};
	window.console.dir = function(str) {};
}

// bstr must be a binary string
function BinaryStringStream(bstr) {
	if (typeof bstr != "string" || bstr.length < 1) {
		throw "Attempted to create BinaryStringStream with a non-string";
	}
	this.str = bstr;
	this.ptr = 0;
	
	// returns the next n bytes as an unsigned number (or -1 on error)
	// and advances the stream pointer n bytes
	this.readNumber = function( n ) {
		var num = this.peekNumber( n );
		this.ptr += n;
		return num;
	};
	
	// peeks at the next n bytes as a number but does not advance the pointer
	this.peekNumber = function( n ) {
		if (typeof n != "number" || n < 1) {
			return -1;
		}
		var result = 0;
		// read from last byte to first byte and roll them in
		var curByte = this.ptr + n - 1;
		while (curByte >= this.ptr) {
			result <<= 8;
			result |= this.str.charCodeAt(curByte);
			--curByte;
		}
		return result;
	};
}

// gets the element with the given id
function getElem(id) {
	if(document.documentElement.querySelector) {
		// querySelector lookup
		return document.body.querySelector('#'+id);
	}	
	// getElementById lookup
	return document.getElementById(id);
}

// attempts to read the file that the user has chosen
function getFile(evt) {
	var inp = evt.target;
	var filelist = inp.files;
	if (filelist.length == 1) {
		var reader = new FileReader();
		reader.onloadend = function(e) {
			// create a BinaryStringStream
			var bstream = new BinaryStringStream(e.target.result);
			// try to unzip it
			// TODO: handle the error scenario here
			unzip(bstream);
		};
		console.log("Reading in file '" + filelist[0].fileName + "'");
		reader.readAsBinaryString(filelist[0]);
	}
}

// attaches a change event listener to the file input control
function init() {
	if (!window.FileReader) {
		alert("Sorry, kthoom will not work with your browser because it does not support the File API.  Please try kthoom with Firefox 3.6+.");
	}
	else {
		var inp = getElem("filechooser");
		inp.addEventListener("change", getFile, false);
	}
}