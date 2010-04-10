/*
 * unzip.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Jeff Schiller
 *
 */

// TODO: put the unzip into its own Web Worker and report progress

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
		throw "Error! Attempted to create a BitStream object with a non-string";
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
			if (bytePtr >= this.str.length) {
				throw "Error!  Overflowed the bit stream!";
				return -1;
			}
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
			throw "Error! peekBytes() called and not byte-aligned";
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
		throw "Error! Attempted to create a ByteStream with a non-string";
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
	
	console.log("Zip Local File Header:");
	console.log(" version=" + this.version);
	console.log(" general purpose=" + this.generalPurpose);
	console.log(" compression method=" + this.compressionMethod);
	console.log(" last mod file time=" + this.lastModFileTime);
	console.log(" last mod file date=" + this.lastModFileDate);
	console.log(" crc32=" + this.crc32);
	console.log(" compressed size=" + this.compressedSize);
	console.log(" uncompressed size=" + this.uncompressedSize);
	console.log(" file name length=" + this.fileNameLength);
	console.log(" extra field length=" + this.extraFieldLength);
	console.log(" filename = '" + this.filename + "'");
	
	this.extraField = null;
	if (this.extraFieldLength > 0) {
		this.extraField = bstream.readString(this.extraFieldLength);
	}
	console.log(" extra field = '" + this.extraField + "'");
	
	// read in the compressed data
	var startByte = bstream.ptr;
	this.fileData = null;
	if (this.compressedSize > 0) {
		this.fileData = bstream.readString(this.compressedSize);
	}
	
	// TODO: deal with data descriptor if present (we currently assume no data descriptor!)
	// "This descriptor exists only if bit 3 of the general purpose bit flag is set"
	// But how do you figure out how big the file data is if you don't know the compressedSize
	// from the header?!?
	if ((this.generalPurpose & BIT[3]) != 0) {
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
		console.log("  starting at byte #" + startByte);
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

// shows a number as its binary representation (8 => "1000")
var binaryValueToString = function(num, len) {
	if (typeof num != typeof 1) {
		throw ("Error! Non-number sent to binaryValueToString: " + num);
		return null;
	}
	var len = len || 0;
	var str = "";
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
			console.log(" Found an Archive Extra Data Signature");
			// skipping this record for now
			bstream.readNumber(4);
			var archiveExtraFieldLength = bstream.readNumber(4);
			bstream.readString(archiveExtraFieldLength);
		}
		
		// central directory structure
		// TODO: handle the rest of the structures (Zip64 stuff)
		if (bstream.peekNumber(4) == zCentralFileHeaderSignature) {
			console.log(" Found a Central File Header");
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
			console.log(" Found a Digital Signature");
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

// returns an array of Huffman codes based on an array of code lengths
// each entry is an object that contains the code and the length
// [ {code: 5, length: 6} ] => 000101
function getHuffmanCodes(bitLengths) {
	// ensure bitLengths is an array containing at least one element
	if (typeof bitLengths != typeof [] || bitLengths.length < 1) {
		throw "Error! getHuffmanCodes() called with an invalid array";
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
		if (typeof length != typeof 1 || length < 0) {
			throw ("bitLengths contained an invalid number in getHuffmanCodes(): " + length + " of type " + (typeof length));
			return null;
		}
		// increment the appropriate bitlength count
		if (bl_count[length] == undefined) bl_count[length] = 0;
		// a length of zero means this symbol is not participating in the huffman coding
		if (length > 0) bl_count[length]++;
		
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
			hCodes[n] = { code: next_code[len], length: len, bitstring: binaryValueToString(next_code[len],len) };
			next_code[len]++;
		}
	}
	
	return hCodes;
}

// reorganizes an array of Huffman Codes (each is an object {code: 5, length: 6})
// into a JavaScript object indexed by its code: {length: 6, symbol: X}
function getHuffmanCodeTable(hcodes) {
	var table = {maxLength: 0};
	// now use them as indices in our map
	for (var i in hcodes) {
		table[hcodes[i].code] = {length: hcodes[i].length, symbol: parseInt(i), 
								bitstring: binaryValueToString(hcodes[i].code,hcodes[i].length)};
		if (hcodes[i].length > table.maxLength) 
			table.maxLength = hcodes[i].length;
	}
//	console.dir(hcodes);
	return table;
}

/*
	 The Huffman codes for the two alphabets are fixed, and are not
	 represented explicitly in the data.  The Huffman code lengths
	 for the literal/length alphabet are:
	
			   Lit Value    Bits        Codes
			   ---------    ----        -----
				 0 - 143     8          00110000 through
										10111111
			   144 - 255     9          110010000 through
										111111111
			   256 - 279     7          0000000 through
										0010111
			   280 - 287     8          11000000 through
										11000111
*/
// fixed Huffman codes go from 7-9 bits, so we need an array whose index can hold up to 9 bits
// TODO: add fixed distance code table generation here (0-31, 5-bits)
var fixedHCtoLiteral = null;
var fixedHCtoDistance = null;
function getFixedLiteralTable() {
	// create once
	if (!fixedHCtoLiteral) {
		var bitlengths = new Array(288);
		for (var i = 0; i <= 143; ++i) bitlengths[i] = 8;
		for (i = 144; i <= 255; ++i) bitlengths[i] = 9;
		for (i = 256; i <= 279; ++i) bitlengths[i] = 7;
		for (i = 280; i <= 287; ++i) bitlengths[i] = 8;
		
		// get huffman code table
		fixedHCtoLiteral = getHuffmanCodeTable( getHuffmanCodes(bitlengths) );
	}
	return fixedHCtoLiteral;
}
function getFixedDistanceTable() {
	// create once
	if (!fixedHCtoDistance) {
		var bitlengths = new Array(32);
		for (var i = 0; i < 32; ++i) { bitlengths[i] = 5; }
		
		// get huffman code table
		fixedHCtoDistance = getHuffmanCodeTable( getHuffmanCodes(bitlengths) );
	}
	return fixedHCtoDistance;
}

// extract one bit at a time until we find a matching Huffman Code
// then return that symbol
function decodeSymbol(bstream, hcTable, debug) {
	var code = 0, len = 0;
	var match = false;
	
	// loop until we match
	for (;;) {
		// read in next bit
		code = (code<<1) | bstream.readBits(1);
		++len;
		if (debug) {
			console.log(" code=" + binaryValueToString(code,len));
		}
		
		// check against Huffman Code table and break if found
		// this is not going to work: if code = 0 and we happen to have a Huffman Code like 000
		// same with code = 1 and Huffman Code 00001
		// then we fail to read in all those bits
		if (hcTable.hasOwnProperty(code) && hcTable[code].length == len) {
			if(debug) console.log("  found code=" + code + " (" + binaryValueToString(code,len) + ")");
			break;
		}
		if (len > hcTable.maxLength) {
			throw "Bit stream out of sync, didn't find a Huffman Code";
			break;
		}
	}
	return hcTable[code].symbol;
}

var CodeLengthCodeOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function inflateBlockData(bstream, hcLiteralTable, hcDistanceTable, output) {
	/*
		  loop (until end of block code recognized)
			 decode literal/length value from input stream
			 if value < 256
				copy value (literal byte) to output stream
			 otherwise
				if value = end of block (256)
				   break from loop
				otherwise (value = 257..285)
				   decode distance from input stream

				   move backwards distance bytes in the output
				   stream, and copy length bytes from this
				   position to the output stream.
	*/
	var numSymbols = 0;
	for (;;) {
		var symbol = decodeSymbol(bstream, hcLiteralTable); //, true);
		++numSymbols;
//		console.log("    Doing symbol #" + numSymbols + ", symbol=" + symbol + ", byte ptr=" + bstream.bytePtr + ", bit ptr=" + bstream.bitPtr);
		if (symbol < 256) {
//			console.log("      is a literal byte " + symbol);
			// copy literal byte to output
			output += String.fromCharCode(symbol);
		}
		else {
			// end of block reached
			if (symbol == 256) {
//				console.log("Found an end-block symbol");
				break;
			}
			else {
//				console.log("      is a length-distance pair");
				// get length as per
				/*
					 Extra               Extra               Extra
				Code Bits Length(s) Code Bits Lengths   Code Bits Length(s)
				---- ---- ------     ---- ---- -------   ---- ---- -------
				 257   0     3       267   1   15,16     277   4   67-82
				 258   0     4       268   1   17,18     278   4   83-98
				 259   0     5       269   2   19-22     279   4   99-114
				 260   0     6       270   2   23-26     280   4  115-130
				 261   0     7       271   2   27-30     281   5  131-162
				 262   0     8       272   2   31-34     282   5  163-194
				 263   0     9       273   3   35-42     283   5  195-226
				 264   0    10       274   3   43-50     284   5  227-257
				 265   1  11,12      275   3   51-58     285   0    258
				 266   1  13,14      276   3   59-66
				*/
				var length = 285;
				if (symbol <= 264) {
					length = (symbol-257)+3;
				}
				else if (symbol <= 268) {
					length = (symbol-265)*2 + 11 + bstream.readBits(1);
				}
				else if (symbol <= 272) {
					length = (symbol-269)*4 + 19 + bstream.readBits(2);
				}
				else if (symbol <= 276) {
					length = (symbol-273)*8 + 35 + bstream.readBits(3);
				}
				else if (symbol <= 280) {
					length = (symbol-277)*16 + 67 + bstream.readBits(4);
				}
				else if (symbol <= 284) {
					length = (symbol-281)*32 + 131 + bstream.readBits(5);
				}
//				console.log("      symbol became length " + length);
				
				// get distance as per
				/*
					  Extra           Extra                Extra
				 Code Bits Dist  Code Bits   Dist     Code Bits Distance
				 ---- ---- ----  ---- ----  ------    ---- ---- --------
				   0   0    1     10   4     33-48    20    9   1025-1536
				   1   0    2     11   4     49-64    21    9   1537-2048
				   2   0    3     12   5     65-96    22   10   2049-3072
				   3   0    4     13   5     97-128   23   10   3073-4096
				   4   1   5,6    14   6    129-192   24   11   4097-6144
				   5   1   7,8    15   6    193-256   25   11   6145-8192
				   6   2   9-12   16   7    257-384   26   12  8193-12288
				   7   2  13-16   17   7    385-512   27   12 12289-16384
				   8   3  17-24   18   8    513-768   28   13 16385-24576
				   9   3  25-32   19   8   769-1024   29   13 24577-32768
				*/
				var distSymbol = decodeSymbol(bstream, hcDistanceTable);
				var distance = 0;
				// TODO: simplify this!
				if (distSymbol <= 3) {
					distance = distSymbol + 1;
				}
				else if (distSymbol <= 5) {
					distance = (distSymbol-4)*2 + 5 + bstream.readBits(1);
				}
				else if (distSymbol <= 7) {
					distance = (distSymbol-6)*4 + 9 + bstream.readBits(2);
				}
				else if (distSymbol <= 9) {
					distance = (distSymbol-8)*8 + 17 + bstream.readBits(3);
				}
				else if (distSymbol <= 11) {
					distance = (distSymbol-10)*16 + 33 + bstream.readBits(4);
				}
				else if (distSymbol <= 13) {
					distance = (distSymbol-12)*32 + 65 + bstream.readBits(5);
				}
				else if (distSymbol <= 15) {
					distance = (distSymbol-14)*64 + 129 + bstream.readBits(6);
				}
				else if (distSymbol <= 17) {
					distance = (distSymbol-16)*128 + 257 + bstream.readBits(7);
				}
				else if (distSymbol <= 19) {
					distance = (distSymbol-18)*256 + 513 + bstream.readBits(8);
				}
				else if (distSymbol <= 21) {
					distance = (distSymbol-20)*512 + 1025 + bstream.readBits(9);
				}
				else if (distSymbol <= 23) {
					distance = (distSymbol-22)*1024 + 2049 + bstream.readBits(10);
				}
				else if (distSymbol <= 25) {
					distance = (distSymbol-24)*2048 + 4097 + bstream.readBits(11);
				}
				else if (distSymbol <= 27) {
					distance = (distSymbol-26)*4096 + 8193 + bstream.readBits(12);
				}
				else if (distSymbol <= 29) {
					distance = (distSymbol-28)*8192 + 16385 + bstream.readBits(13);
				}

//				console.log("      distSymbol=" + distSymbol + ", distance = " + distance + ", output length is currently " + output.length + " bytes");
				
				// now apply length and distance appropriately and copy to output

				// TODO: check that backward distance < data.length?
				
				// http://tools.ietf.org/html/rfc1951#page-11
				// "Note also that the referenced string may overlap the current
				//  position; for example, if the last 2 bytes decoded have values
				//  X and Y, a string reference with <length = 5, distance = 2>
				//  adds X,Y,X,Y,X to the output stream."
				// 
				// loop for each character
				var ch = output.length - distance;
				while (length--) {
					output += output[ch++];
				}
			}
		}
	} // loop until we reach end of block
	return output;
}

// compression method 8
// deflate: http://tools.ietf.org/html/rfc1951
function inflate(compressedData) {
	var data = "";
	console.log("inflating " + compressedData.length + " bytes");
//	console.dir(compressedData);
	var bstream = new BitStream(compressedData);
	var numBlocks = 0;
	// block format: http://tools.ietf.org/html/rfc1951#page-9
	do {
		var bFinal = bstream.readBits(1),
			bType = bstream.readBits(2);
		++numBlocks;
		console.log("Starting block #" + numBlocks + (bFinal ? " (this is the last block)" : ""));
		// no compression
		console.log(" type=" + bType);
		if (bType == 0) {
			// skip remaining bits in this byte
			bstream.readBits(5);
			var len = bstream.readBits(16),
				nlen = bstream.readBits(16);
			// TODO: check if nlen is the ones-complement of len?
			data += bstream.readBytes(len);
		}
		// fixed Huffman codes
		else if(bType == 1) {
			data = inflateBlockData(bstream, getFixedLiteralTable(), getFixedDistanceTable(), data);
		}
		// dynamic Huffman codes
		else if(bType == 2) {
			// TODO: I think something's wrong with the way I'm decoding bit lengths somehow
			var numLiteralLengthCodes = bstream.readBits(5) + 257;
//			console.log("raw byte = " + binaryValueToString(bstream.peekBytes(1).charCodeAt(0),8));
			var numDistanceCodes = bstream.readBits(5) + 1,
				numCodeLengthCodes = bstream.readBits(4) + 4;
				
//			console.log("# literal length codes = " + numLiteralLengthCodes + ", # distance codes = " + numDistanceCodes + ", # code length codes = " + numCodeLengthCodes);
			
			// populate the array of code length codes (first de-compaction)		
			var codeLengthsCodeLengths = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
			for (var i = 0; i < numCodeLengthCodes; ++i) {
				codeLengthsCodeLengths[ CodeLengthCodeOrder[i] ] = bstream.readBits(3);
			}
			
			// get the Huffman Codes for the code lengths
			var codeLengthsCodes = getHuffmanCodeTable(getHuffmanCodes(codeLengthsCodeLengths));
			
			// now follow this mapping 
			/*
               0 - 15: Represent code lengths of 0 - 15
                   16: Copy the previous code length 3 - 6 times.
                       The next 2 bits indicate repeat length
                             (0 = 3, ... , 3 = 6)
                          Example:  Codes 8, 16 (+2 bits 11),
                                    16 (+2 bits 10) will expand to
                                    12 code lengths of 8 (1 + 6 + 5)
                   17: Repeat a code length of 0 for 3 - 10 times.
                       (3 bits of length)
                   18: Repeat a code length of 0 for 11 - 138 times
                       (7 bits of length)
			*/
			// to generate the true code lengths of the Huffman Codes for the literal
			// and distance tables together
			var literalCodeLengths = [];
			var prevCodeLength = 0;
			while (literalCodeLengths.length < numLiteralLengthCodes + numDistanceCodes) {
				var symbol = decodeSymbol(bstream, codeLengthsCodes);
//				console.log("decoding symbol, length=" + literalCodeLengths.length + ", symbol=" + symbol + " (type=" + (typeof symbol) + ")");
				if (symbol <= 15) {
					literalCodeLengths.push(symbol);
					prevCodeLength = symbol;
				}
				else if (symbol == 16) {
					var repeat = bstream.readBits(2) + 3;
					while (repeat--) {
						literalCodeLengths.push(prevCodeLength);
					}
				}
				else if (symbol == 17) {
					var repeat = bstream.readBits(3) + 3;
					while (repeat--) {
						literalCodeLengths.push(0);
					}
				}
				else if (symbol == 18) {
					var repeat = bstream.readBits(7) + 11;
					while (repeat--) {
						literalCodeLengths.push(0);
					}
				}
			}
//			console.log(" done code lengths");
			
			// now split the distance code lengths out of the literal code array
			var distanceCodeLengths = literalCodeLengths.splice(numLiteralLengthCodes, numDistanceCodes);
			
			// now generate the true Huffman Code tables using these code lengths
			var hcLiteralTable = getHuffmanCodeTable(getHuffmanCodes(literalCodeLengths)),
				hcDistanceTable = getHuffmanCodeTable(getHuffmanCodes(distanceCodeLengths));
			data = inflateBlockData(bstream, hcLiteralTable, hcDistanceTable, data);

//			console.log(" block #" + numBlocks + " had " + numSymbols + " in it");
		}
		// error
		else {
			throw "Error! Encountered deflate block of type 3";
			return null;
		}
	} while (bFinal != 1);
	// we are done reading blocks if the bFinal bit was set for this block
	console.log("data size=" + data.length);
	return data;
}
