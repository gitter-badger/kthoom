/**
 * book.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */
import { createURLFromArray } from './helpers.js';

const LoadState = {
  NOT_LOADED: 0,
  LOADING: 1,
  LOADED: 2,
  LOADING_ERROR: 3,
};

const UnarchiveState = {
  NOT_UNARCHIVED: 0,
  UNARCHIVING: 1,
  UNARCHIVED: 2,
  UNARCHIVING_ERROR: 3,
};

const FormatType = {
  UNKNOWN: 0,
  ZIP: 1,
  RAR: 2,
  TAR: 3,
};

export class BookEvent {
  constructor(book) { this.book = book; }
}

// TODO: Add newBytes to this event?
export class LoadProgressEvent extends BookEvent {
  constructor(book, pct) {
    super(book);
    this.percentage = pct;
  }
}

export class LoadCompleteEvent extends BookEvent {
  constructor(book) { super(book); }
}

export class UnarchiveProgressEvent extends BookEvent {
  constructor(book, pct) {
    super(book);
    this.percentage = pct;
  }
}

export class UnarchivePageExtractedEvent extends BookEvent {
  constructor(book, page, pageNum) {
    super(book);
    this.page = page;
    this.pageNum = pageNum;
  }
}

export class UnarchiveCompleteEvent extends BookEvent {
  constructor(book) { super(book); }
}

// Stores an image filename and its data: URI.
export class ImageFile {
  constructor(file) {
    this.data = file;
    this.filename = file.filename;
    const fileExtension = file.filename.split('.').pop().toLowerCase();
    const mimeType = fileExtension == 'png' ? 'image/png' :
        (fileExtension == 'jpg' || fileExtension == 'jpeg') ? 'image/jpeg' :
        fileExtension == 'gif' ? 'image/gif' : undefined;
    this.dataURI = createURLFromArray(file.fileData, mimeType);
  }
}

export class Page {
  constructor(imageFilename, imageFile) {
    this.imageFilename = imageFilename;
    this.imageFile = imageFile;
  }
}

/**
 * A Book has a name, a set of pages, and a loading and unarchiving state.  It is responsible for
 * unarchiving itself and emitting events to any subscribers as interesting things happen to it.
 */
export class Book {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name_ = name;

    this.formatType_ = FormatType.UNKNOWN;
    this.loadState_ = LoadState.NOT_LOADED;
    this.unarchiveState_ = UnarchiveState.NOT_UNARCHIVED;

    this.loadingPercentage_ = 0.0;
    this.unarchivingPercentage_ = 0.0;

    this.ab_ = null;
    this.unarchiver_ = null;

    this.totalPages_ = 0;
    this.pages_ = [];

    this.subscribers_ = {};
  }

  isLoaded() { return this.loadState_ === LoadState.LOADED; }
  isUnarchived() { return this.unarchiveState_ === UnarchiveState.UNARCHIVED; }

  getName() { return this.name_; }
  getFormatType() { return this.formatType_; }
  getLoadingPercentage() { return this.loadingPercentage_; }
  getUnarchivingPercentage() { return this.unarchivingPercentage_; }
  getNumberOfPages() { return this.totalPages_; }
  getNumberOfPagesReady() { return this.pages_.length; }
  getPage(i) {
    if (i < 0 || i >= this.totalPages_) {
      return null;
    }
    return this.pages_[i];
  }

  loadFromXhr(xhr, expectedSize) {
    if (this.loadState_ !== LoadState.NOT_LOADED) {
      throw 'Cannot try to load via XHR when the Book is already loading';
    }

    xhr.responseType = 'arraybuffer';
    xhr.onprogress = (evt) => {
      let pct = undefined;
      if (evt.lengthComputable && evt.total) {
        pct = evt.loaded / evt.total;
      } else if (expectedSize) {
        pct = evt.loaded / expectedSize;
      }
      if (pct) {
        this.loadingPercentage_ = pct;
        this.notify_(new LoadProgressEvent(this, pct));
      }
    }
    xhr.onload = (evt) => {
      const arrayBuffer = evt.target.response;
      this.setArrayBuffer(arrayBuffer);
      this.notify_(new LoadCompleteEvent(this));
    };
    xhr.send(null);
  }

  setArrayBuffer(ab) {
    this.ab_ = ab;
    this.formatType_ = FormatType.UNKNOWN;
    this.unarchiver_ = null;
    this.totalPages_ = 0;
    this.pages_ = [];
    this.loadState_ = LoadState.LOADED;
    this.loadingPercentage_ = 1.0;
    this.unarchiveState_ = UnarchiveState.NOT_UNARCHIVED;
    this.unarchivingPercentage_ = 0.0;
  }

  unarchive() {
    const start = (new Date).getTime();
    const h = new Uint8Array(this.ab_, 0, 10);
    const pathToBitJS = 'code/bitjs/';
    if (h[0] == 0x52 && h[1] == 0x61 && h[2] == 0x72 && h[3] == 0x21) { // Rar!
      this.formatType_ = FormatType.RAR;
      this.unarchiver_ = new bitjs.archive.Unrarrer(this.ab_, pathToBitJS);
    } else if (h[0] == 0x50 && h[1] == 0x4B) { // PK (Zip)
      this.formatType_ = FormatType.ZIP;
      this.unarchiver_ = new bitjs.archive.Unzipper(this.ab_, pathToBitJS);
    } else if (h[0] == 255 && h[1] == 216) { // JPEG
      // TODO: Figure out if we want to keep this.
      /*
      this.totalPages_ = 1;
      this.setProgressMeter(1, 'Archive Missing');
      const dataURI = createURLFromArray(new Uint8Array(this.ab_), 'image/jpeg');
      this.setImage(dataURI);
      // hide logo
      getElem('logo').setAttribute('style', 'display:none');
      */
      return;
    } else { // Try with tar
      this.formatType_ = FormatType.TAR;
      this.unarchiver_ = new bitjs.archive.Untarrer(this.ab_, pathToBitJS);
    }

    // Listen for UnarchiveEvents.
    // TODO: Error if no unarchiver.
    if (this.unarchiver_) {
      this.unarchiveState_ = UnarchiveState.UNARCHIVING;

      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.PROGRESS, (e) => {
          this.totalPages_ = e.totalFilesInArchive;

          const percentage = e.currentBytesUnarchived / e.totalUncompressedBytesInArchive;
          this.unarchivingPercentage_ = percentage;
          this.notify_(new UnarchiveProgressEvent(this, percentage));
      });
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.INFO, (e) => console.log(e.msg));
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.EXTRACT, (e) => {
          // convert DecompressedFile into a bunch of ImageFiles
          // TODO: Error if not present?
          if (e.unarchivedFile) {
            const f = e.unarchivedFile;
            const newPage = new Page(f.filename, new ImageFile(f));
            // TODO: Error if we have more pages than totalPages_.
            this.pages_.push(newPage);
            this.notify_(new UnarchivePageExtractedEvent(this, newPage, this.pages_.length));
          }
      });
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.FINISH, (e) => {
          this.unarchiveState_ = UnarchiveState.UNARCHIVED;
          this.unarchivingPercentage_ = 1.0;
          const diff = ((new Date).getTime() - start)/1000;
          console.log('Unarchiving done in ' + diff + 's');
          this.notify_(new UnarchiveCompleteEvent(this));
      });
      this.unarchiver_.start();
    } else {
      alert('Some error');
    }
  }

  subscribe(source, callback) {
    this.subscribers_[source] = callback;
  }

  unsubscribe(source) {
    if (this.subscribers_[source]) {
      delete this.subscribers_[source];
    }
  }

  /** @private */
  notify_(evt) {
    for (let source in this.subscribers_) {
      const callbackFn = this.subscribers_[source].bind(source);
      callbackFn(evt, this);
    }
  }
}

// Factory methods.

/**
 * @param {File} file
 * @return {Promise<Book>}
 */
Book.fromFile = function(file) {
  return new Promise((resolve, reject) => {
    const book = new Book(file.name);

    const fr = new FileReader();
    fr.onload = () => {
      book.setArrayBuffer(fr.result);
      resolve(book);
    };
    fr.readAsArrayBuffer(file);
  });
};

/**
 * @param {string} name The book name.
 * @param {XMLHttpRequest} xhr XHR ready with the method, url and header.
 * @param {number} expectedSize Unarchived size in bytes.
 * @return {Promise<Book>}
 */
Book.fromXhr = function(name, xhr, expectedSize) {
  return new Promise((resolve, reject) => {
    const book = new Book(name);
    book.loadFromXhr(xhr, expectedSize);
    resolve(book);
  });
};

/**
 * @param {string} name The book name.
 * @param {ArrayBuffer} ab The ArrayBuffer filled with the unarchived bytes.
 * @return {Promise<Book>}
 */
Book.fromArrayBuffer = function(name, ab) {
  return new Promise((resolve, reject) => {
    const book = new Book(name);
    book.setArrayBuffer(ab);
    resolve(book);
  });
};
