/*
 * unzip.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Jeff Schiller
 *
 */

/* 
  Reference Documentation:

  * ZIP format: http://www.pkware.com/documents/casestudies/APPNOTE.TXT
  * DEFLATE format: http://tools.ietf.org/html/rfc1951

*/

var zLocalFileHeaderSignature = 0x04034b50;
var zArchiveExtraDataSignature = 0x08064b50;
var zCentralFileHeaderSignature = 0x02014b50;

// takes a BinaryStringString and parses out the local file information
function ZipLocalFile(bstream) {
	if (typeof bstream != "object" || !bstream.readNumber || typeof bstream.readNumber != "function") {
		return null;
	}
	this.signature = bstream.readNumber(4);
	this.version = bstream.readNumber(2);
	this.generalPurpose = bstream.readNumber(2);
	this.compressionMethod = bstream.readNumber(2);
	this.lastModFileTime = bstream.readNumber(2);
	this.lastModFileDate = bstream.readNumber(2);
	this.crc32 = bstream.readNumber(4);
	this.compressedSize = bstream.readNumber(4);
	this.uncompressedSize = bstream.readNumber(4);
	this.fileNameLength = bstream.readNumber(2);
	this.extraFieldLength = bstream.readNumber(2);
	
	this.filename = null;
	if (this.fileNameLength > 0) {
		this.filename = bstream.readString(this.fileNameLength);
	}
	
	this.extraField = null;
	if (this.extraFieldLength > 0) {
		this.extraField = bstream.readString(this.extraFieldLength);
	}
	
	// read in the compressed data
	this.fileData = null;
	if (this.compressedSize > 0) {
		this.fileData = bstream.readString(this.compressedSize);
	}
	
	// TODO: deal with data descriptor if present (we currently assume no data descriptor!)
	// "This descriptor exists only if bit 3 of the general purpose bit flag is set"
	// But how do you figure out how big the file data is if you don't know the compressedSize
	// from the header?!?
	if ((this.generalPurpose & BIT3) != 0) {
		console.log("dd");
		this.crc32 = bstream.readNumber(4);
		this.compressedSize = bstream.readNumber(4);
		this.uncompressedSize = bstream.readNumber(4);
	}
	
	// now determine what kind of compressed data we have and decompress
	
	// Zip Version 1.0, no compression (store only)
	if (this.version == 10 && this.compressionMethod == 0) {
		console.log("ZIP v1.0, store only: " + this.filename + " (" + this.compressedSize + " bytes)");
	}
	// TODO: version == 20, compression method == 8
	else {
		console.log("UNSUPPORTED VERSION/FORMAT: ZIP v" + this.version + ", compression method=" + this.compressionMethod + ": " + this.filename + " (" + this.compressedSize + " bytes)");
	}
}

// Takes a BinaryStringStream of a zip file in
// returns null on error
// returns ??? on success
function unzip(bstream) {
	// detect local file header signature or return null
	if (bstream.peekNumber(4) == zLocalFileHeaderSignature) {
		console.log("Found a zip file!");
		
		var localfiles = [];
		// loop until we don't see any more local files
		while ( bstream.peekNumber(4) == zLocalFileHeaderSignature) {
			var localfile = new ZipLocalFile(bstream);
			localfiles.push(localfile);
		}
		
		// TODO: process the image data in each local file...
		// TODO: return something useful to kthoom
	}
	else {
		console.log("File was not a zip");
	}
	return null;
}
