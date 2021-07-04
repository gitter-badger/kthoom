/**
 * book.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */
import { createBookBinderAsync } from './book-binder.js';
import { BookEventType, BookLoadingStartedEvent, BookLoadingCompleteEvent,
         BookProgressEvent } from './book-events.js';
import { BookPumpEventType } from './book-pump.js';
import { EventEmitter } from './event-emitter.js';

/**
 * A Book has a name, a set of pages, and a BookBinder which handles the process of loading,
 * unarchiving, and page setting.
 */
export class Book extends EventEmitter {
  /**
   * @param {string} name
   * @param {string|FileSystemHandle} uriOrFileHandle For files loaded via URI, this param contains
   *     the URI. For files loaded via the local file system, it contains the FileSystemHandle.
   */
  constructor(name, uriOrFileHandle = undefined) {
    super();

    /**
     * The name of the book (shown in the Reading Stack).
     * @type {String}
     */
    this.name_ = name;

    /**
     * The optional URI of the book (not set for a book loaded from the file system).
     * @type {String}
     */
    this.uri_ = typeof(uriOrFileHandle) === 'string' ? uriOrFileHandle : undefined;

    /**
     * The optional FileSystemHandle of the book (not set for book loaded from a URI).
     * @type {FileSystemHandle}
     */
    this.fileHandle_ = typeof(uriOrFileHandle) !== 'string' ? uriOrFileHandle : undefined;

    /** @private {boolean} */
    this.needsLoading_ = true;

    /** @private {boolean} */
    this.finishedLoading_ = false;

    /**
     * The total known number of pages.
     * @private {number}
     */
    this.totalPages_ = 0;

    /** @private {BookBinder} */
    this.bookBinder_ = null;

    /** @private {Array<Page>} */
    this.pages_ = [];

    /** @private {Document} */
    this.metadataDoc_ = null;

    /**
     * A reference to the ArrayBuffer is kept to let the user easily download a copy.
     * This array buffer is only valid once the book has fully loaded.
     * @private {ArrayBuffer}
     */
    this.arrayBuffer_ = null;
  }

  /**
   * Called when bytes have been appended. This creates a new ArrayBuffer.
   * @param {ArrayBuffer} appendBuffer
   */
  appendBytes(appendBuffer) {
    let newBuffer = new Uint8Array(this.arrayBuffer_.length + appendBuffer.length);
    newBuffer.set(this.arrayBuffer_, 0);
    newBuffer.set(appendBuffer, this.arrayBuffer_.length);
    this.arrayBuffer_ = newBuffer;
  }

  /** @return {Promise<ArrayBuffer>} */
  getArrayBuffer() {
    return this.arrayBuffer_;
  }

  getMIMEType() {
    if (!this.bookBinder_) {
      throw 'Cannot call getMIMEType() without a BookBinder';
    }
    return this.bookBinder_.getMIMEType();
  }

  getName() { return this.name_; }
  getLoadingPercentage() {
    if (!this.bookBinder_) return 0;
    return this.bookBinder_.getLoadingPercentage();
  }
  getUnarchivingPercentage() {
    if (!this.bookBinder_) return 0;
    return this.bookBinder_.getUnarchivingPercentage();
  }
  getLayoutPercentage() {
    if (!this.bookBinder_) return 0;
    return this.bookBinder_.getLayoutPercentage();
  }
  getNumberOfPages() { return this.totalPages_; }
  getNumberOfPagesReady() { return this.pages_.length; }

  /**
   * @param {number} i A number from 0 to (num_pages - 1).
   * @return {Page}
   */
  getPage(i) {
    // TODO: This is a bug in the unarchivers.  The only time totalPages_ is set is
    // upon getting a UnarchiveEventType.PROGRESS which has the total number of files.
    // In some books, we get an EXTRACT event before we get the first PROGRESS event.
    const numPages = this.totalPages_ || this.pages_.length;
    if (i < 0 || i >= numPages) {
      return null;
    }
    return this.pages_[i];
  }

  /** @return {string} */
  getUri() {
    return this.uri_;
  }

  /** @return {boolean} */
  isFinishedLoading() {
    return this.finishedLoading_;
  }

  /**
   * Starts an XHR and progressively loads in the book.
   * TODO: Get rid of this and just use loadFromFetch() everywhere.
   * @param {Number} expectedSize If -1, the total field from the XHR Progress event is used.
   * @param {Object<string, string>} headerMap A map of request header keys and values.
   * @return {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  loadFromXhr(expectedSize = -1, headerMap = {}) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via XHR when the Book is already loading or loaded';
    }
    if (!this.uri_) {
      throw 'URI for book was not set from loadFromXhr()';
    }

    this.needsLoading_ = false;
    this.notify(new BookLoadingStartedEvent(this));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', this.uri_, true);
      for (const headerKey in headerMap) {
        xhr.setRequestHeader(headerKey, headerMap[headerKey]);
      }

      xhr.responseType = 'arraybuffer';
      xhr.onprogress = (evt) => {
        if (this.bookBinder_) {
          if (expectedSize == -1 && evt.total) {
            expectedSize = evt.total;
            this.bookBinder_.setNewExpectedSize(evt.loaded, evt.total);
          }
          this.notify(new BookProgressEvent(this, this.pages_.length));
        }
      };
      xhr.onload = (evt) => {
        const ab = evt.target.response;
        this.startBookBinding_(this.uri_, ab, expectedSize);
        this.finishedLoading_ = true;
        this.notify(new BookLoadingCompleteEvent(this));
        resolve(this);
      };
      xhr.onerror = (err) => {
        reject(err);
      };
      xhr.send(null);
    });
  }

  /**
   * Starts a fetch and progressively loads in the book.
   * @param {Number} expectedSize The total number of bytes expected.
   * @param {Object<string, string>} init A map of request header keys and values.
   * @return {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  loadFromFetch(expectedSize, init) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via XHR when the Book is already loading or loaded';
    }
    if (!this.uri_) {
      throw 'URI for book was not set in loadFromFetch()';
    }

    this.needsLoading_ = false;
    this.notify(new BookLoadingStartedEvent(this));

    return fetch(this.uri_, init).then(response => {
      const reader = response.body.getReader();
      const readAndProcessNextChunk = () => {
        reader.read().then(({ done, value }) => {
          if (!done) {
            // value is a chunk of the file as a Uint8Array.
            if (!this.bookBinder_) {
              return this.startBookBinding_(this.name_, value.buffer, expectedSize).then(() => {
                return readAndProcessNextChunk();
              })
            }
            this.bookBinder_.appendBytes(value.buffer);
            this.appendBytes(value.buffer);
            return readAndProcessNextChunk();
          } else {
            this.finishedLoading_ = true;
            this.notify(new BookLoadingCompleteEvent(this));
            return this;
          }
        });
      };
      return readAndProcessNextChunk();
    }).catch(e => {
      console.error(`Error from fetch: ${e}`);
      throw e;
    });
  }

  /**
   * @param {File} file
   * @return {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  loadFromFile(file) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via File when the Book is already loading or loaded';
    }
    if (this.uri_) {
      throw 'URI for book was set in loadFromFile()';
    }

    this.needsLoading_ = false;
    this.notify(new BookLoadingStartedEvent(this));

    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const ab = fr.result;
        try {
          this.startBookBinding_(file.name, ab, ab.byteLength);
          this.finishedLoading_ = true;
          this.notify(new BookLoadingCompleteEvent(this));
        } catch (err) {
          const errMessage = err + ': ' + file.name;
          console.error(errMessage);
          reject(errMessage);
        }
        resolve(this);
      };
      fr.readAsArrayBuffer(file);
    });
  }

  /**
   * @param {string} fileName
   * @param {ArrayBuffer} ab
   * @return {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  loadFromArrayBuffer(fileName, ab) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via File when the Book is already loading or loaded';
    }
    if (this.uri_) {
      throw 'URI for book was set in loadFromArrayBuffer()';
    }

    this.needsLoading_ = false;
    this.notify(new BookLoadingStartedEvent(this));
    this.startBookBinding_(fileName, ab, ab.byteLength);
    this.finishedLoading_ = true;
    this.notify(new BookLoadingCompleteEvent(this));
    return Promise.resolve(this);
  }

  /**
   * @param {string} bookUri
   * @param {BookPump} bookPump
   */
  loadFromBookPump(bookUri, bookPump) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via BookPump when the Book is already loading or loaded';
    }
    if (this.uri_) {
      throw 'URI for book was set in loadFromBookPump()';
    }

    this.needsLoading_ = false;
    let bookBinderPromise = null;
    return new Promise((resolve, reject) => {
      bookPump.subscribeToAllEvents(this, evt => {
        // If we get any error, reject the promise to create a book.
        if (evt.type === BookPumpEventType.BOOKPUMP_ERROR) {
          reject(evt.err);
        }

        // If we do not have a book binder yet, create it and start the process.
        if (!bookBinderPromise) {
          try {
            bookBinderPromise = this.startBookBinding_(bookUri, evt.ab, evt.totalExpectedSize);
          } catch (err) {
            const errMessage = `${err}: ${file.name}`;
            console.error(errMessage);
            reject(errMessage);
          }
        } else {
          // Else, we wait on the book binder being finished before processing the event.
          bookBinderPromise.then(() => {
            switch (evt.type) {
              case BookPumpEventType.BOOKPUMP_DATA_RECEIVED:
                this.bookBinder_.appendBytes(evt.ab);
                this.appendBytes(value.buffer);
                break;
              case BookPumpEventType.BOOKPUMP_END:
                this.finishedLoading_ = true;
                this.notify(new BookLoadingCompleteEvent(this));
                resolve(this);
                break;
            }
          });
        }
      });
    });
  }

  /**
   * @returns {boolean} True if this book has not started loading, false otherwise.
   */
  needsLoading() {
    return this.needsLoading_;
  }

  /**
   * Creates and sets the BookBinder, subscribes to its events, and starts the book binding process.
   * This function is called by all loadFrom... methods.
   * @param {string} fileNameOrUri
   * @param {ArrayBuffer} ab Starting buffer of bytes. May be complete or may be partial depending
   *                         on which loadFrom... method was called.
   * @param {number} totalExpectedSize
   * @return {Promise<BookBinder>}
   * @private
   */
  startBookBinding_(fileNameOrUri, ab, totalExpectedSize) {
    this.arrayBuffer_ = ab;
    return createBookBinderAsync(fileNameOrUri, ab, totalExpectedSize).then(bookBinder => {
      this.bookBinder_ = bookBinder;
      // Extracts some state from the BookBinder events, re-sources the events, and sends them out to
      // the subscribers to this Book.
      this.bookBinder_.subscribeToAllEvents(this, evt => {
        switch (evt.type) {
          case BookEventType.METADATA_XML_EXTRACTED:
            this.metadataDoc_ = evt.metadataDoc;
            break;
          case BookEventType.PAGE_EXTRACTED:
            this.pages_.push(evt.page);
            break;
          case BookEventType.PROGRESS:
            if (evt.totalPages) {
              this.totalPages_ = evt.totalPages;
            }
            break;
        }

        evt.source = this;
        this.notify(evt);
      });

      this.bookBinder_.start();
    });
  }
}
