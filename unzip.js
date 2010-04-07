/*
 * unzip.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Jeff Schiller
 *
 */

/* Reference Documentation:

  * ZIP format: http://www.pkware.com/documents/casestudies/APPNOTE.TXT

*/

var zFileHeaderSignature = 0x04034b50;

// bstr is a binary string
// start is the first byte to consider (must be >= 0)
// numBytes is the number of bytes to consider (must be >= 1)
// on error, returns -1
// otherwise, returns the bytes converted into an unsigned number
function toNumber( bstr, startByte, numBytes ) {
	if (typeof bstr != "string" || typeof startByte != "number" || typeof numBytes != "number" ||
		startByte < 0 || numBytes < 1) 
	{
		return -1;
	}
	
	var result = 0;
	// read from last byte to first byte and roll them in
	var curByte = startByte + numBytes - 1;
	while (curByte >= startByte) {
		result <<= 8;
		result |= bstr.charCodeAt(curByte);
		--curByte;
	}
	return result;
}

// Takes a binary string of a zip file in
// returns null on error
// returns ??? on success
function unzip(bstr) {
	// detect local file header signature or return null
	if (toNumber(bstr,0,4) == zFileHeaderSignature) {
		console.log("Found a zip file!");
	}
	else {
		console.log("File was not a zip");
	}
	return null;
}