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
	if (typeof bstr != typeof "" || bstr.length < 1) {
		alert("Error! Attempted to create a BitStream object with a non-string");
	}
	this.str = bstr;
	this.bytePtr = 0; // tracks which byte we are on
	this.bitPtr = 0; // contains values 0 through 7
	
	// returns the next n bits as an unsigned number, advancing the pointer if movePointers is true
	this.peekBits = function( n, movePointers ) {
		if (typeof n != typeof 1 || n < 1) {
			return -1;
		}
		
		var movePointers = movePointers || false;
		var bytePtr = this.bytePtr,
			bitPtr = this.bitPtr,
			result = 0;
		
		// keep going until we have no more bits left to peek at
		var bitsIn = 0;
		while (n > 0) {
			var numBitsLeftInThisByte = (8 - bitPtr);
			if (n >= numBitsLeftInThisByte) {
				var mask = (BITMASK[numBitsLeftInThisByte] << bitPtr);
				result |= (((this.str.charCodeAt(bytePtr) & mask) >> bitPtr) << bitsIn);
				
				bytePtr++;
				bitPtr = 0;
				bitsIn += numBitsLeftInThisByte;
				n -= numBitsLeftInThisByte;
			}
			else {
				var mask = (BITMASK[n] << bitPtr);
				result |= (((this.str.charCodeAt(bytePtr) & mask) >> bitPtr) << bitsIn);
				
				bitPtr += n;
				bitsIn += n;
				n = 0;
			}
		}
		
		if (movePointers) {
			this.bitPtr = bitPtr;
			this.bytePtr = bytePtr;
		}
		
		return result;
	};
	
	this.readBits = function( n ) {
		return this.peekBits(n, true);
	};
	
	// this returns n bytes as a binary string, advancing the pointer if movePointers is true
	this.peekBytes = function( n, movePointers ) {
		if (typeof n != typeof 1 || n < 1) {
			return -1;
		}
		
		var movePointers = movePointers || false;
		var bytePtr = this.bytePtr,
			bitPtr = this.bitPtr,
			result = "";
			
		// special-case if we are byte-aligned
		if (bitPtr == 0) {
			result = this.str.substring(bytePtr, bytePtr+n);
		}
		// else, use peekBits()
		else {
			// TODO: implement
			alert("Error! peekBytes() called and not byte-aligned");
		}

		if (movePointers) {
			this.bytePtr += n;
		}
		
		return result;
	};
	
	this.readBytes = function( n ) {
		return this.peekBytes(n, true);
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
	if (typeof bstr != typeof "" || bstr.length < 1) {
		alert("Error! Attempted to create a ByteStream with a non-string");
	}
	this.str = bstr;
	this.ptr = 0;
	
	// peeks at the next n bytes as an unsigned number but does not advance the pointer
	this.peekNumber = function( n ) {
		// TODO: return error if n would go past the end of the stream?
		if (typeof n != typeof 1 || n < 1) {
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
		if (typeof n != typeof 1 || n < 1) {
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
	if (typeof bstream != typeof {} || !bstream.readNumber || typeof bstream.readNumber != typeof function(){}) {
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
	// TODO: version == 20, compression method == 8 (DEFLATE)
	else if (this.version == 20 && this.compressionMethod == 8) {
		console.log("ZIP v2.0, DEFLATE: " + this.filename + " (" + this.compressedSize + " bytes)");
		
		this.fileData = inflate(this.fileData);
		this.isValid = true;
	}
	else {
		console.log("UNSUPPORTED VERSION/FORMAT: ZIP v" + this.version + ", compression method=" + this.compressionMethod + ": " + this.filename + " (" + this.compressedSize + " bytes)");
		this.isValid = false;
		this.fileData = null;
	}
}

// helper function that will create a binary stream out of an array of numbers
// bytes must be an array and contain numbers, each varying from 0-255
var createBinaryString = function(bytes) {
	if (typeof bytes != typeof []) {
		return null;
	}
	var bstr = new Array(bytes.length);
	for (var i = 0; i < bytes.length; ++i) {
		bstr[i] = String.fromCharCode(bytes[i]);
	}
	return bstr.join('');
};

// returns an array of Huffman codes based on an array of code lengths
function getHuffmanCodes(bitLengths) {
	// ensure bitLengths is an array containing at least one element
	if (typeof bitLengths != typeof [] || bitLengths.length < 1) {
		alert("Error! getHuffmanCodes() called with an invalid array");
		return null;
	}
	
	// Reference: http://tools.ietf.org/html/rfc1951#page-8
	var numLengths = bitLengths.length,
		hCodes = new Array(numLengths),
		bl_count = [],
		MAX_BITS = 1;
	
	// Step 1: count up how many codes of each length we have
	for (var i = 0; i < numLengths; ++i) {
		var length = bitLengths[i];
		// test to ensure each bit length is a positive, non-zero number
		if (typeof length != typeof 1 || length < 1) {
			alert("bitLengths contained an invalid number in getHuffmanCodes()");
			return null;
		}
		// increment the appropriate bitlength count
		if (bl_count[length] == undefined) bl_count[length] = 0;
		bl_count[length]++;
		
		if (length > MAX_BITS) MAX_BITS = length;
	}
	
	// Step 2: Find the numerical value of the smallest code for each code length
	var next_code = [],
		code = 0;
	for (var bits = 1; bits <= MAX_BITS; ++bits) {
		var length = bits-1;
		// ensure undefined lengths are zero
		if (bl_count[length] == undefined) bl_count[length] = 0;
		code = (code + bl_count[bits-1]) << 1;
		next_code[bits] = code;
	}
	
	// Step 3: Assign numerical values to all codes
	for (var n = 0; n < numLengths; ++n) {
		var len = bitLengths[n];
		if (len != 0) {
			hCodes[n] = next_code[len];
			next_code[len]++;
		}
	}
	
	return hCodes;
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

// compression method 8
// deflate: http://tools.ietf.org/html/rfc1951
function inflate(compressedData) {
	var data = "";
	
	var bstream = new BitStream(compressedData),
		readBits = bstream.readBits,
		readBytes = bstream.readBytes;
	
	// block format: http://tools.ietf.org/html/rfc1951#page-9
	
	do {
		var bFinal = readBits(1),
			bType = readBits(2);
		
		// no compression
		if (bType == 0) {
			// skip remaining bits in this byte
			readBits(5);
			var len = readBits(16),
				nlen = readBits(16);
			// TODO: check if nlen is the ones-complement of len?
			data += readBytes(len);
		}
		// fixed Huffman codes
		else if(bType == 1) {
		}
		// dynamic Huffman codes
		else if(bType == 2) {
		}
		// error
		else {
			alert("Error! Encountered deflate block of type 3");
			return null;
		}
	} while (bFinal != 1);
	// we are done reading blocks if the bFinal bit was set for this block

	return data;
}