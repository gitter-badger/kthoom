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

var BIT0 = 0x01,
	BIT1 = 0x02,
	BIT2 = 0x04,
	BIT3 = 0x08,
	BIT4 = 0x10,
	BIT5 = 0x20,
	BIT6 = 0x40,
	BIT7 = 0x80,
	BIT8 = 0x100,
	BIT9 = 0x200,
	BIT10 = 0x400,
	BIT11 = 0x800,
	BIT12 = 0x1000,
	BIT13 = 0x2000,
	BIT14 = 0x4000,
	BIT15 = 0x8000;

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

	// returns the next n bytes as a string (or -1 on error)
	// and advances the stream pointer n bytes
	this.readString = function( n ) {
		var str = this.peekString( n );
		this.ptr += n;
		return str;
	};
	
	// peeks at the next n bytes as a number but does not advance the pointer
	this.peekString = function( n ) {
		if (typeof n != "number" || n < 1) {
			return -1;
		}
		return this.str.substring(this.ptr, this.ptr+n);
	};
}

// stores an image filename and its data: URI
// TODO: investigate if we really need to store as base64 (leave off ;base64 and just
//       non-safe URL characters are encoded as %xx ?)
function ImageFile(filename, bytes) {
	this.filename = filename;
	this.dataURI = "data:image/jpeg;base64," + Utils.encode64(bytes);
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
			var zipFiles = unzip(bstream);
			if (zipFiles) {
				// convert ZipLocalFiles into a bunch of ImageFiles
				var imageFiles = [];
				for (f in zipFiles) {
					var zip = zipFiles[f];
					imageFiles.push(new ImageFile(zip.filename, zip.fileData));
				}
				if (imageFiles.length > 0) {
					getElem("mainImage").setAttribute("src", imageFiles[0].dataURI);
				}
			}
			else {
				alert("Could not read file '" + filelist[0].filename + "'");
			}
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

var Utils = {

	// This code was written by Tyler Akins and has been placed in the
	// public domain.  It would be nice if you left this header intact.
	// Base64 code from Tyler Akins -- http://rumkin.com

	// schiller: Removed string concatenation in favour of Array.join() optimization,
	//           also precalculate the size of the array needed.

	"_keyStr" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

	"encode64" : function(input) {
		if(window.btoa) return window.btoa(input); // Use native if available
		// base64 strings are 4/3 larger than the original string
		var output = new Array( Math.floor( (input.length + 2) / 3 ) * 4 );
		var chr1, chr2, chr3;
		var enc1, enc2, enc3, enc4;
		var i = 0, p = 0;

		do {
			chr1 = input.charCodeAt(i++);
			chr2 = input.charCodeAt(i++);
			chr3 = input.charCodeAt(i++);

			enc1 = chr1 >> 2;
			enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
			enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
			enc4 = chr3 & 63;

			if (isNaN(chr2)) {
				enc3 = enc4 = 64;
			} else if (isNaN(chr3)) {
				enc4 = 64;
			}

			output[p++] = this._keyStr.charAt(enc1);
			output[p++] = this._keyStr.charAt(enc2);
			output[p++] = this._keyStr.charAt(enc3);
			output[p++] = this._keyStr.charAt(enc4);
		} while (i < input.length);

		return output.join('');
	}
};
