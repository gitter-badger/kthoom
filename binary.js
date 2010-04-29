/*
 * binary.js - provides bit/byte readers
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
		throw "Error! Attempted to create a BitStream object with a non-string";
	}
	
	this.str = bstr;
	
	// we turn it from a binary string into a series of byte values once (because we might
	// read 8 different bits per byte later and we don't want to have to call charCodeAt
	// each time)
	var i = bstr.length;
	var barr = new Array(i);
	while (i--)
		barr[i] = bstr.charCodeAt(i);
	this.bytes = barr;
	
	this.bytePtr = 0; // tracks which byte we are on
	this.bitPtr = 0; // tracks which bit we are on (can have values 0 through 7)
};

// returns the next n bits as an unsigned number, advancing the pointer if movePointers is true
BitStream.prototype.peekBits = function( n, movePointers ) {
		if (n <= 0 || typeof n != typeof 1)
			return 0;
		
		var movePointers = movePointers || false,
			bytePtr = this.bytePtr,
			bitPtr = this.bitPtr,
			result = 0,
			bitsIn = 0,
			bytes = this.bytes;
		
		// keep going until we have no more bits left to peek at
		while (n > 0) {
			if (bytePtr >= bytes.length) {
				throw "Error!  Overflowed the bit stream!";
				return -1;
			}
			var numBitsLeftInThisByte = (8 - bitPtr);
			if (n >= numBitsLeftInThisByte) {
				var mask = (BITMASK[numBitsLeftInThisByte] << bitPtr);
				result |= (((bytes[bytePtr] & mask) >> bitPtr) << bitsIn);
				
				bytePtr++;
				bitPtr = 0;
				bitsIn += numBitsLeftInThisByte;
				n -= numBitsLeftInThisByte;
			}
			else {
				var mask = (BITMASK[n] << bitPtr);
				result |= (((bytes[bytePtr] & mask) >> bitPtr) << bitsIn);
				
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
	
BitStream.prototype.readBits = function( n ) {
		return this.peekBits(n, true);
};
	
// this returns n bytes as a binary string, advancing the pointer if movePointers is true
// only use this for uncompressed blocks as this throws away remaining bits in the current byte
BitStream.prototype.peekBytes = function( n, movePointers ) {
		if (n <= 0 || typeof n != typeof 1)
			return 0;
		
		// from http://tools.ietf.org/html/rfc1951#page-11
		// "Any bits of input up to the next byte boundary are ignored."
		while (this.bitPtr != 0)
			this.readBits(1);

		var movePointers = movePointers || false;
		var bytePtr = this.bytePtr,
			bitPtr = this.bitPtr,
			result = "";
		
		result = this.str.substr(bytePtr, n);

		if (movePointers) {
			this.bytePtr += n;
		}
		
		return result;
};

BitStream.prototype.readBytes = function( n ) {
		return this.peekBytes(n, true);
};

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
};

// peeks at the next n bytes as an unsigned number but does not advance the pointer
// TODO: This apparently cannot read more than 4 bytes as a number?
ByteStream.prototype.peekNumber = function( n ) {
		// TODO: return error if n would go past the end of the stream?
		if (n <= 0 || typeof n != typeof 1)
			return -1;
		var result = 0,
			str = this.str;
		// read from last byte to first byte and roll them in
		var curByte = this.ptr + n - 1;
		while (curByte >= this.ptr) {
			result <<= 8;
			result |= str.charCodeAt(curByte);
			--curByte;
		}
		return result;
};

// returns the next n bytes as an unsigned number (or -1 on error)
// and advances the stream pointer n bytes
ByteStream.prototype.readNumber = function( n ) {
		var num = this.peekNumber( n );
		this.ptr += n;
		return num;
};
	
// peeks at the next n bytes as a string but does not advance the pointer
ByteStream.prototype.peekString = function( n ) {
		if (n <= 0 || typeof n != typeof 1)
			return 0;
		return this.str.substr(this.ptr, n);
};

// returns the next n bytes as a string (or -1 on error)
// and advances the stream pointer n bytes
ByteStream.prototype.readString = function( n ) {
		var strToReturn = this.peekString( n );
		this.ptr += n;
		return strToReturn;
};
