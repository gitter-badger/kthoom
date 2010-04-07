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

// Takes a BinaryStringStream of a zip file in
// returns null on error
// returns ??? on success
function unzip(bstream) {
	// detect local file header signature or return null
	if (bstream.peekNumber(4) == zLocalFileHeaderSignature) {
		console.log("Found a zip file!");
		
		// TODO: create object for LocalFile and read in header, data, data descriptor
		// TODO: loop until we don't see any more local files
		
		var signature = bstream.readNumber(4),
			version = bstream.readNumber(2),
			generalPurpose = bstream.readNumber(2),
			compressionMethod = bstream.readNumber(2),
			lastModFileTime = bstream.readNumber(2),
			lastModFileDate = bstream.readNumber(2),
			crc32 = bstream.readNumber(4),
			compressedSize = bstream.readNumber(4),
			uncompressedSize = bstream.readNumber(4),
			fileNameLength = bstream.readNumber(2),
			extraFieldLength = bstream.readNumber(2);
		console.log([version, generalPurpose, compressionMethod, lastModFileTime, lastModFileDate,
					crc32, compressedSize, uncompressedSize, fileNameLength, extraFieldLength]);
	}
	else {
		console.log("File was not a zip");
	}
	return null;
}
