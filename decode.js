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
    currentImage = -1;
    imageFiles = [];
    imageFilenames = [];
    unzip(result, gDebug);
    //unrar(result, gDebug);
  }

};
