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
  const offset = array.byteOffset;
  const len = array.byteLength;
  let blob = new Blob([array], {type: mimeType}).slice(offset, offset + len, mimeType);
  return URL.createObjectURL(blob);
};

const guessMimeType = function(filename) {
  const fileExtension = filename.split('.').pop().toLowerCase();
  return (fileExtension === 'png') ? 'image/png' :
      (fileExtension === 'jpg' || fileExtension === 'jpeg') ? 'image/jpeg' :
      (fileExtension === 'gif') ? 'image/gif' :
      (fileExtension === 'htm' || fileExtension === 'html') ? 'text/html' :
      undefined;
};

/**
 * Factory method that creates a Page from a File.
 * @param {File} file
 * @return {Promise<Page>} A Promise that gets a Page (like an ImagePage).
 */
export const createPageFromFile = function(file) {
  return new Promise((resolve, reject) => {
    const mimeType = guessMimeType(file.filename);
    const dataURI = createURLFromArray(file.fileData, mimeType);

    if (mimeType) {
      if (mimeType.indexOf('image/') === 0) {
        const img = new Image();
        img.onload = () => { resolve(new ImagePage(file, img)); };
        img.onerror = (e) => { reject(e); };
        img.src = dataURI;
      } else if (mimeType === 'text/html') {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', dataURI, true);
        xhr.onload = () => { resolve(new HtmlPage(file, xhr.responseText)); };
        xhr.onerror = (e) => { reject(e); };
        xhr.send(null);
      }
    } else {
      // Try TextPage.
      const xhr = new XMLHttpRequest();
      xhr.open('GET', dataURI, true);
      xhr.onload = () => {
        if (xhr.responseText.length < 10 * 1024) {
          resolve(new TextPage(file, xhr.responseText));
        } else {
          reject('Could not create a new page from file ' + file.filename);
        }
      };
      xhr.onerror = (e) => { reject(e); };
      xhr.send(null);
    }
  });
};
