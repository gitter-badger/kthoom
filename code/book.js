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
  READY_FOR_UNARCHIVING: 1,
  UNARCHIVING: 2,
  UNARCHIVED: 3,
  UNARCHIVING_ERROR: 4,
};

export class BookEvent {
  constructor(book) { this.book = book; }
}

export class LoadProgressEvent extends BookEvent {
  constructor(book, pct) {
    super(book);
    this.percentage = pct;
  }
}

export class ReadyToUnarchiveEvent extends BookEvent {
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
  constructor(filename, imageFile) {
    this.filename = filename;
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

    this.loadState_ = LoadState.NOT_LOADED;
    this.unarchiveState_ = UnarchiveState.NOT_UNARCHIVED;

    this.loadingPercentage_ = 0.0;
    this.unarchivingPercentage_ = 0.0;

    this.unarchiver_ = null;

    this.totalPages_ = 0;
    this.pages_ = [];

    this.subscribers_ = {};
  }

  getName() { return this.name_; }
  getLoadingPercentage() { return this.loadingPercentage_; }
  getUnarchivingPercentage() { return this.unarchivingPercentage_; }
  getNumberOfPages() { return this.totalPages_; }
  getNumberOfPagesReady() { return this.pages_.length; }
  getPage(i) {
    // TODO: This is a bug in the unarchivers.  The only time totalPages_ is set is
    // upon getting a UnarchiveEvent.Type.PROGRESS which has the total number of files.
    // In some books, we get an EXTRACT event before we get the first PROGRESS event.
    const numPages = this.totalPages_ || this.pages_.length;
    if (i < 0 || i >= numPages) {
      return null;
    }
    return this.pages_[i];
  }
  isReadyToUnarchive() { return this.unarchiveState_ === UnarchiveState.READY_FOR_UNARCHIVING; }

  loadFromXhr(xhr, expectedSize) {
    if (this.loadState_ !== LoadState.NOT_LOADED) {
      throw 'Cannot try to load via XHR when the Book is already loading or loaded';
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
      this.setArrayBuffer(arrayBuffer, 1.0);
    };
    xhr.send(null);
  }

  loadFromFetch(url, init, expectedSize) {
    if (this.loadState_ !== LoadState.NOT_LOADED) {
      throw 'Cannot try to load via XHR when the Book is already loading or loaded';
    }

    fetch(url, init).then(response => {
      const reader = response.body.getReader();
      let bytesRead = 0;
      const readAndProcessNextChunk = () => {
        reader.read().then(({done, value}) => {
          if (!done) {
            // value is a chunk of the file as a Uint8Array.
            bytesRead += value.length;
            let pct = bytesRead / expectedSize;

            if (!this.unarchiver_) {
              // At this point, the Unarchiver should be created and we should have
              // enough to get started on the unarchiving process.
              this.setArrayBuffer(value.buffer, pct);
            } else {
              // Update the unarchiver with more bytes.
              this.unarchiver_.update(value.buffer);
            }

            this.notify_(new LoadProgressEvent(this, pct));

            readAndProcessNextChunk();
          }
        });
      };
      readAndProcessNextChunk();
    });
  }

  /**
   * Creates the Unarchiver.
   * @param {ArrayBuffer} ab
   * @param {number} pctLoaded
   */
  setArrayBuffer(ab, pctLoaded) {
    this.unarchiver_ = null;
    this.totalPages_ = 0;
    this.pages_ = [];
    this.loadState_ = pctLoaded < 1.0 ? LoadState.LOADING : LoadState.LOADED;
    this.loadingPercentage_ = pctLoaded;
    this.unarchiveState_ = UnarchiveState.READY_FOR_UNARCHIVING;
    this.unarchivingPercentage_ = 0.0;

    // TODO: Figure out if we want to keep single JPEG file handling.
    /*
    const h = new Uint8Array(ab, 0, 10);
    if (h[0] == 255 && h[1] == 216) { // JPEG
      this.totalPages_ = 1;
      this.setProgressMeter(1, 'Archive Missing');
      const dataURI = createURLFromArray(new Uint8Array(ab), 'image/jpeg');
      this.setImage(dataURI);
      // hide logo
      getElem('logo').setAttribute('style', 'display:none');
    }
    */
    this.unarchiver_ = bitjs.archive.GetUnarchiver(ab, 'code/bitjs/');

    if (!this.unarchiver_) {
      alert('Could not determine the unarchiver to use for the file');
      throw 'Could not determine the unarchiver to use for the file'
    }

    this.notify_(new ReadyToUnarchiveEvent(this));
  }

  unarchive() {
    const start = (new Date).getTime();

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
          // Convert each unarchived file into a Page.
          // TODO: Error if not present?
          if (e.unarchivedFile) {
            const f = e.unarchivedFile;
            const newPage = new Page(f.filename, new ImageFile(f));
            // TODO: Error if we have more pages than totalPages_.
            this.pages_.push(newPage);

            // Do not send extracted events yet, because the pages may not be in the correct order.
            //this.notify_(new UnarchivePageExtractedEvent(this, newPage, this.pages_.length));
          }
      });
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.FINISH, (e) => {
        this.unarchiveState_ = UnarchiveState.UNARCHIVED;
        this.unarchivingPercentage_ = 1.0;
        const diff = ((new Date).getTime() - start)/1000;
        console.log('Unarchiving done in ' + diff + 's');

        // Sort the book's pages based on filename, issuing an extract event for each page in
        // its proper order.
        this.pages_.sort((a,b) => a.filename.toLowerCase() > b.filename.toLowerCase() ? 1 : -1);
        for (let i = 0; i < this.pages_.length; ++i) {
          this.notify_(new UnarchivePageExtractedEvent(this, this.pages_[i], i + 1));
        }

        this.notify_(new UnarchiveCompleteEvent(this));

        // Stop the Unarchiver (which will kill the worker) and then delete the unarchiver
        // which should free up some memory, including the unarchived array buffer.
        this.unarchiver_.stop();
        this.unarchiver_ = null;
      });
      this.unarchiver_.start();
    } else {
      alert('Error:  Could not determine the type of comic book archive file.  ' +
        'kthoom only supports cbz, cbr and cbt files.');
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
      book.setArrayBuffer(fr.result, 1.0);
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
 * @param {string} url The resource to fetch.
 * @param {Object} init An object to initialize the Fetch API.
 * @param {number} expectedSize Unarchived size in bytes.
 * @return {Promise<Book>}
 */
Book.fromFetch = function(name, url, init, expectedSize) {
  return new Promise((resolve, reject) => {
    const book = new Book(name);
    book.loadFromFetch(url, init, expectedSize);
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
    book.setArrayBuffer(ab, 1.0);
    resolve(book);
  });
};
