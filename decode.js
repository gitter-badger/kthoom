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

var gDebug = false;
//var postMessage = null;
//window.unzip = {};

// this common interface encapsulates a decompressed file
// both ZipLocalFile and RarLocalFile support these two 
// two properties: filename and fileData (unpacked bytes)
function DecompressedFile(filename, fileData) {
	this.filename = filename;
	this.fileData = fileData;
}

function ProgressReport() {
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

onmessage = function(event) {
  // TODO: Remove this once we're back to using Workers.
  var file = event.data.file;
  
  var xhr = new XMLHttpRequest();
  xhr.open('GET', file, true);
  xhr.responseType = 'arraybuffer';
  xhr.send();
  gDebug = event.data.debug;
  xhr.onload = function(){
    var result = xhr.response;
    var arr = new Uint8Array(result, 0, 7);
    if(arr[0] == 80 && arr[1] == 75 && arr[2] == 3 && arr[3] == 4){
    	unzip(result, gDebug);
    }else if(arr[0] == 0x52 && arr[1] == 0x61 && arr[2] == 0x72 && arr[3] == 0x21 && arr[4] == 0x1a && arr[5] == 0x07 && arr[6] == 0x00){
      postMessage("found RAR file");
      unrar(result, gDebug);
      
    }else{
      postMessage("Error: Unknown file format");
    }
  }

};
