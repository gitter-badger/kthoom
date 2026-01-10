/*
 * metadata.js
 *
 * Reads metadata from images.
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2023 Google Inc.
 */

// Metadata storage of interest: XMP, Exif, IPTC.

import * as fs from 'node:fs';
import { findMimeType } from '../../file/sniffer.js';
import { GifParser } from '../parsers/gif.js';

const FILENAME = 'tests/image-testfiles/xmp.gif';

/**
 * @param {ArrayBuffer} ab 
 * @returns {Promise<void>} A Promise that resolves when parsing is done.
 */
export async function getImageMetadata(ab) {
  const mimeType = findMimeType(ab);
  switch (mimeType) {
    case 'image/gif':
      const gifParser = new GifParser(ab);
      gifParser.addEventListener('application_extension', evt => {
        const ext = evt.applicationExtension;
        if (ext.applicationIdentifier === 'XMP Data') {
          const authCode = new TextDecoder().decode(ext.applicationAuthenticationCode);
          if (authCode === 'XMP') {
            // TODO: Parse this.
            console.dir(new TextDecoder().decode(ext.applicationData));
          }
        }
      });

      await gifParser.start();

      break;
    default:
      throw `Unsupported image type: ${mimeType}`;
  }

  return null;
}

function main() {
  const nodeBuf = fs.readFileSync(FILENAME);
  const fileData = new Uint8Array(
      nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.length));
  getImageMetadata(fileData.buffer);
}

main();
