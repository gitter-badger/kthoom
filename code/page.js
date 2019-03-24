/**
 * page.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

export class Page {
  constructor(file) {
    /** @type {string} */
    this.filename = file.filename;
  }

  /** @return {Number} The width-height aspect ratio. */
  getAspectRatio() { return 6.625 / 10.25; }
}

export class ImagePage extends Page {
  /**
   * @param {File} file 
   * @param {Image} img The Image object created.
   */
  constructor(file, img) {
    super(file);
    this.img = img;
  }

  getAspectRatio() { return this.img.naturalWidth / this.img.naturalHeight; }
}

export class TextPage extends Page {
  /**
   * @param {File} file
   * @param {string} text The raw text in the page.
   */
  constructor(file, text) {
    super(file);
    this.rawText = text;
  }
}

export class HtmlPage extends TextPage {
  /**
   * @param {File} file
   * @param {string} rawHtml The raw html in the page.
   */
  constructor(file, rawHtml) {
    super(file, rawHtml);
    this.escapedHtml = escape(rawHtml);
  }
}

const createURLFromArray = function(array, mimeType) {
  if (mimeType === 'image/xml+svg') {
    const xmlStr = new TextDecoder('utf-8').decode(array);
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(xmlStr);
  }
  const offset = array.byteOffset;
  const len = array.byteLength;
  let blob = new Blob([array], {type: mimeType}).slice(offset, offset + len, mimeType);
  return URL.createObjectURL(blob);
};


/**
 * @param {string} filename
 * @return {string|undefined} The MIME type or undefined if we could not guess it.
 */
function guessMimeType(filename) {
  const fileExtension = filename.split('.').pop().toLowerCase();
  switch (fileExtension) {
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/xml+svg';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'htm': case 'html': return 'text/html';
    case 'sfv': return 'text/x-sfv';
    case 'txt': return 'text/plain';
  }

  // Skip over PAR files (.PAR, .P01, etc).
  if (fileExtension === 'par' || /^p\d\d$/.test(fileExtension)) {
    return 'application/octet-stream';
  }

  return undefined;
};

/**
 * Factory method that creates a Page from a File.
 * @param {File} file
 * @return {Promise<Page>} A Promise that gets a Page (like an ImagePage).
 */
export const createPageFromFile = function(file) {
  return new Promise((resolve, reject) => {
    const mimeType = guessMimeType(file.filename);
    if (!mimeType) {
      resolve(new TextPage(file, 'Could not determine type of file "' + file.filename + '"'));
      return;
    }

    const dataURI = createURLFromArray(file.fileData, mimeType);

    if (mimeType.indexOf('image/') === 0) {
      const img = new Image();
      img.onload = () => { resolve(new ImagePage(file, img)); };
      img.onerror = (e) => { resolve(new TextPage(file, `Could not open file ${file.filename}`)); };
      img.src = dataURI;
    } else if (mimeType === 'text/html') {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', dataURI, true);
      xhr.onload = () => { resolve(new HtmlPage(file, xhr.responseText)); };
      xhr.onerror = (e) => { reject(e); };
      xhr.send(null);
    } else if (mimeType.startsWith('text/')) {
      // TextPage.
      const xhr = new XMLHttpRequest();
      xhr.open('GET', dataURI, true);
      xhr.onload = () => {
        if (xhr.responseText.length < 1000 * 1024) {
          resolve(new TextPage(file, xhr.responseText));
        } else {
          reject('Could not create a new page from file ' + file.filename);
        }
      };
      xhr.onerror = (e) => { reject(e); };
      xhr.send(null);
    } else if (mimeType === 'application/octet-stream') {
      resolve(new TextPage(file, 'Could not display binary file "' + file.filename + '"'));
    }
  });
};
