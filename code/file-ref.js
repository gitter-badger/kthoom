/**
 * file-ref.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2019 Google Inc.
 */

/**
 * A reference to a file in an archive.
 */
export class FileRef {
  /**
   * @param {string} id
   * @param {string} href
   * @param {string} rootDir
   * @param {string} mediaType
   * @param {Uint8Array} data
   */
  constructor(id, href, rootDir, mediaType, data) {
    /** @type {string} */
    this.id = id;

    /** @type {string} */
    this.href = href;

    /** @type {string} */
    this.rootDir = rootDir;

    /** @type {string} */
    this.mediaType = mediaType;

    /** @type {Uint8Array} */
    this.data = data;

    /** @private {Blob} */
    this.blob_ = undefined;

    /** @private {string} */
    this.blobURL_ = undefined;
  }

  /**
   * @param {Window} win
   * @return {Blob}
   */
  getBlob(win) {
    if (!this.blob) this.initializeBlob_(win);
    return this.blob;
  }

  /**
   * @param {Window} win 
   * @return {stribng}
   */
  getBlobURL(win) {
    if (!this.blobURL) this.initializeBlob_(win);
    return this.blobURL;
  }

  /**
   * @param {Window} win 
   * @private
   */
  initializeBlob_(win) {
    this.blob = new win.Blob([this.data], {type: this.mediaType});
    this.blobURL = win.URL.createObjectURL(this.blob);
  }
}
