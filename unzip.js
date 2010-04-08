/*
 * unzip.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Jeff Schiller
 *
 */

// mask for getting the Nth bit (zero-based)
var BIT = [	0x01, 0x02, 0x04, 0x08, 
			0x10, 0x20, 0x40, 0x80,
			0x100, 0x200, 0x400, 0x800, 
			0x1000, 0x2000, 0x4000, 0x8000];

// mask for getting N number of bits (0-8)
var BITMASK = [ 0, 0x01, 0x03, 0x07, 0x0F, 0x1F, 0x3F, 0x7F, 0xFF ];


// This object allows you to peek and consume bits out of a binary stream.
//
// bstr must be a binary string
function BitStream(bstr) {
	if (typeof bstr != "string" || bstr.length < 1) {
		alert("Error! Attempted to create a BitStream object with a non-string");
	}
	this.str = bstr;
	this.bytePtr = 0; // tracks which byte we are on
	this.bitPtr = 0; // contains values 0 through 7
	
	// peeks at the next n bits as an unsigned number but does not advance the pointer
	this.peekBits = function( n ) {
		if (typeof n != "number" || n < 1) {
			return -1;
		}
	}
}

// This object allows you to peek and consume bytes as numbers and strings
// out of a binary stream.
//
// This object is much easier to write than the above BitStream since everything
// is byte-aligned.
//
// bstr must be a binary string
function ByteStream(bstr) {
	if (typeof bstr != "string" || bstr.length < 1) {
		alert("Error! Attempted to create a ByteStream with a non-string");
	}
	this.str = bstr;
	this.ptr = 0;
	
	// peeks at the next n bytes as an unsigned number but does not advance the pointer
	this.peekNumber = function( n ) {
		// TODO: return error if n would go past the end of the stream?
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

	// returns the next n bytes as an unsigned number (or -1 on error)
	// and advances the stream pointer n bytes
	this.readNumber = function( n ) {
		var num = this.peekNumber( n );
		this.ptr += n;
		return num;
	};
	
	// peeks at the next n bytes as a string but does not advance the pointer
	this.peekString = function( n ) {
		if (typeof n != "number" || n < 1) {
			return -1;
		}
		return this.str.substring(this.ptr, this.ptr+n);
	};

	// returns the next n bytes as a string (or -1 on error)
	// and advances the stream pointer n bytes
	this.readString = function( n ) {
		var str = this.peekString( n );
		this.ptr += n;
		return str;
	};
}

/* 
  Reference Documentation:

  * ZIP format: http://www.pkware.com/documents/casestudies/APPNOTE.TXT
  * DEFLATE format: http://tools.ietf.org/html/rfc1951

*/
var zLocalFileHeaderSignature = 0x04034b50;
var zArchiveExtraDataSignature = 0x08064b50;
var zCentralFileHeaderSignature = 0x02014b50;
var zDigitalSignatureSignature = 0x05054b50;
var zEndOfCentralDirSignature = 0x06064b50;
var zEndOfCentralDirLocatorSignature = 0x07064b50;

// takes a ByteStream and parses out the local file information
function ZipLocalFile(bstream) {
	if (typeof bstream != "object" || !bstream.readNumber || typeof bstream.readNumber != "function") {
		return null;
	}
	bstream.readNumber(4); // swallow signature
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
	if ((this.generalPurpose & BIT[3]) != 0) {
		console.log("dd");
		this.crc32 = bstream.readNumber(4);
		this.compressedSize = bstream.readNumber(4);
		this.uncompressedSize = bstream.readNumber(4);
	}
	
	// now determine what kind of compressed data we have and decompress
	
	// Zip Version 1.0, no compression (store only)
	if (this.version == 10 && this.compressionMethod == 0) {
		console.log("ZIP v1.0, store only: " + this.filename + " (" + this.compressedSize + " bytes)");
		this.isValid = true;
	}
	// TODO: version == 20, compression method == 8
	else {
		console.log("UNSUPPORTED VERSION/FORMAT: ZIP v" + this.version + ", compression method=" + this.compressionMethod + ": " + this.filename + " (" + this.compressedSize + " bytes)");
		this.isValid = false;
		this.fileData = null;
	}
}

// Takes a binary string of a zip file in
// returns null on error
// returns an array of ZipLocalFile objects on success
function unzip(bstr) {
	var bstream = new ByteStream(bstr);
	// detect local file header signature or return null
	if (bstream.peekNumber(4) == zLocalFileHeaderSignature) {
		var localFiles = [];
		
		// loop until we don't see any more local files
		while (bstream.peekNumber(4) == zLocalFileHeaderSignature) {
			var oneLocalFile = new ZipLocalFile(bstream);
			// this should strip out directories/folders
			if (oneLocalFile && oneLocalFile.uncompressedSize > 0) {
				localFiles.push(oneLocalFile);
			}
		}
		
		// archive extra data record
		if (bstream.peekNumber(4) == zArchiveExtraDataSignature) {
			// skipping this record for now
			bstream.readNumber(4);
			var archiveExtraFieldLength = bstream.readNumber(4);
			bstream.readString(archiveExtraFieldLength);
		}
		
		// central directory structure
		// TODO: handle the rest of the structures (Zip64 stuff)
		if (bstream.peekNumber(4) == zCentralFileHeaderSignature) {
			// read all file headers
			while (bstream.peekNumber(4) == zCentralFileHeaderSignature) {
				bstream.readNumber(4); // signature
				bstream.readNumber(2); // version made by
				bstream.readNumber(2); // version needed to extract
				bstream.readNumber(2); // general purpose bit flag
				bstream.readNumber(2); // compression method
				bstream.readNumber(2); // last mod file time
				bstream.readNumber(2); // last mod file date
				bstream.readNumber(4); // crc32
				bstream.readNumber(4); // compressed size
				bstream.readNumber(4); // uncompressed size
				var fileNameLength = bstream.readNumber(2); // file name length
				var extraFieldLength = bstream.readNumber(2); // extra field length
				var fileCommentLength = bstream.readNumber(2); // file comment length
				bstream.readNumber(2); // disk number start
				bstream.readNumber(2); // internal file attributes
				bstream.readNumber(4); // external file attributes
				bstream.readNumber(4); // relative offset of local header
				
				bstream.readString(fileNameLength); // file name
				bstream.readString(extraFieldLength); // extra field
				bstream.readString(fileCommentLength); // file comment				
			}
		}
		
		// digital signature
		if (bstream.peekNumber(4) == zDigitalSignatureSignature) {
			bstream.readNumber(4);
			var sizeOfSignature = bstream.readNumber(2);
			bstream.readString(sizeOfSignature); // digital signature data
		}
		
		// TODO: process the image data in each local file...
		if (localFiles.length > 0) {
			console.log("Found " + localFiles.length + " files");
		}
		
		return localFiles;
	}
	else {
		console.log("File was not a zip");
	}
	return null;
}
