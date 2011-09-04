/*
 * unzip.js - requires binary.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Jeff Schiller
 *
 */
importScripts('binary.js');
importScripts('unzip.js');
importScripts('unrar.js');
importScripts('untar.js');

// this common interface encapsulates a decompressed file
// both ZipLocalFile and RarLocalFile support these two 
// two properties: filename and fileData (unpacked bytes)
var DecompressedFile = function(filename, fileData) {
  this.filename = filename;
  this.fileData = fileData;
};

var ProgressReport = function() {
  this.isDone = false;
  this.isValid = false;
	
  this.totalNumFilesInZip = 0;
  this.totalSizeInBytes = 0;
	
  this.currentFilename = "";
  this.currentFileBytesUnzipped = 0;
  this.totalBytesUnzipped = 0;
  this.message = "";
	
  this.localFiles = [];
}
var progress = new ProgressReport();

// NOTE: This is an unused function now since we've moved to Typed Arrays.
// helper function that will create a binary stream out of an array of numbers
// bytes must be an array and contain numbers, each varying from 0-255
var createBinaryString = function(bytes) {
	if (typeof bytes != typeof []) {
		return null;
	}
	var i = bytes.length,
		bstr = new Array(i);
	while (i--)
		bstr[i] = String.fromCharCode(bytes[i]);
	return bstr.join('');
};

// shows a number as its binary representation (8 => "1000")
// len is the number of bits, if num=8 and len=6, this function would return "001000"
var binaryValueToString = function(num, len) {
	if (typeof num != typeof 1) {
		throw ("Error! Non-number sent to binaryValueToString: " + num);
		return null;
	}
	var len = len || 0,
		str = "";
	do {
		// get least-significant bit
		var bit = (num & 0x1);
		// insert it left into the string
		str = (bit ? "1" : "0") + str;
		// shift it one bit right
		num >>= 1;
		--len;
	} while (num != 0 || len > 0);
	
	return str;
};

// shows a byte value as its hex representation
var nibble = "0123456789ABCDEF";
var byteValueToHexString = function(num) {
  return nibble[num>>4] + nibble[num&0xF];
};
var twoByteValueToHexString = function(num) {
  return nibble[(num>>12)&0xF] + nibble[(num>>8)&0xF] + nibble[(num>>4)&0xF] + nibble[num&0xF];
};


var Buffer = function(numBytes) {
  if (typeof numBytes != typeof 1 || numBytes <= 0) {
    throw "Error! Buffer initialized with '" + numBytes + "'";
  }
  this.data = new Uint8Array(numBytes);
  this.ptr = 0;
};
	
Buffer.prototype.insertByte = function(b) {
  // TODO: throw if byte is invalid?
  this.data[this.ptr++] = b;
};
	
Buffer.prototype.insertBytes = function(bytes) {
  // TODO: throw if bytes is invalid?
  this.data.set(bytes, this.ptr);
  this.ptr += bytes.length;
};

function createURLFromArray(array) {
  return array
  
  var bb, url;
  var bb = (typeof BlobBuilder == 'function' ? (new BlobBuilder()) : // Chrome 8
             (typeof WebKitBlobBuilder == 'function' ? (new WebKitBlobBuilder()) : // Chrome 12
               (typeof MozBlobBuilder == 'function' ? (new MozBlobBuilder()) : // Firefox 6
             null)));
  if (!bb) return false;
  bb.append(array.buffer);
  var offset = array.byteOffset, len = array.byteLength;
  var blob = bb.getBlob();
  
  if (blob.webkitSlice) { // Chrome 12
    blob = blob.webkitSlice(offset, offset + len);
  } else if(blob.mozSlice) { // Firefox 5
    blob = blob.mozSlice(offset, offset + len);
  } else if(blob.slice) { //
    blob = blob.slice(2, 3).length == 1 ? 
      blob.slice(offset, offset + len) : // future behavior
      blob.slice(offset, len); // Old behavior
  }
  
  var url = (typeof createObjectURL == 'function' ? createObjectURL(blob) : //Chrome 9?
              (typeof createBlobURL == 'function' ? createBlobURL(blob) : //Chrome 8
                ((typeof URL == 'object' && typeof URL.createObjectURL == 'function') ? URL.createObjectURL(blob) : //Chrome 15? Firefox
                  ((typeof webkitURL == 'object' && typeof webkitURL.createObjectURL == 'function') ? webkitURL.createObjectURL(blob) : //Chrome 10
                    ''))));
  return url;
}

onmessage = function(event) {
  gDebug = event.data.debug;
  var file = event.data.file;
  
  var h = new Uint8Array(file, 0, 10);
  if(h[0] == 0x52 && h[1] == 0x61 && h[2] == 0x72 && h[3] == 0x21){ //Rar!
    unrar(file, gDebug);
  }else if(h[0] == 80 && h[1] == 75){ //PK (Zip)
    unzip(file, gDebug);
  }else if(h[0] == 117 && h[1] == 115 && h[2] == 116 && h[3] == 97 && h[4] == 114){ //ustar
    untar(file, gDebug);
  }


/*
  var filename = event.data.filename;
  var extension = filename.split(".")[1];
  switch (extension) {
    case 'cbz':
      unzip(file, gDebug);
      break;
    case 'cbr':
      unrar(file, gDebug);
      break;
    case 'cbt':
      untar(file, gDebug);
      break;
  }
  var fr = new FileReader();
  fr.onload = function() {
    var result = fr.result;
    unzip(result, debug);
  };
  fr.readAsArrayBuffer(file);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', file, true);
  xhr.responseType = 'arraybuffer';
  xhr.send();
  xhr.onload = function() {
    var result = xhr.response;
  	unzip(result, debug);
  };
*/
};
