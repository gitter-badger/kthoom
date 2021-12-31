/**
 * book.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */
import { createBookBinderAsync } from './book-binder.js';
import { BookEventType, BookLoadingStartedEvent, BookLoadingCompleteEvent,
         BookProgressEvent, 
         BookPageExtractedEvent,
         BookBindingCompleteEvent} from './book-events.js';
import { BookMetadata, createEmptyMetadata } from './metadata/book-metadata.js';
import { BookPumpEventType } from './book-pump.js';

/**
 * @typedef BookOrBookContainer A shared type that both Book and BookContainer implement.
 * @property {function} getContainer
 * @property {function} getName
 */

/**
 * A BookContainer represents a folder containing books on the native file system.
 * @implements {BookOrBookContainer}
 */
export class BookContainer {
  /**
   * @param {string} name 
   * @param {FileSystemDirectoryHandle} handle
   * @param {BookContainer} parent An optional parent.
   */
  constructor(name, handle, parent) {
    /** @type {string} */
    this.name = name;

    /** @type {FileSystemDirectoryHandle} */
    this.handle = handle;

    /** @type {BookContainer} */
    this.parent = parent;

    /** @type {Array<Book|BookContainer>} */
    this.entries = [];
  }
  getContainer() { return this.parent; }
  getName() { return this.name; }
}

/**
 * A Book has a name, a set of pages, and a BookBinder which handles the process of loading,
 * unarchiving, and page setting. A Book will either have a URI, a File object, or a
 * FileSystemFileHandle object from which to load the data. Books may also have a container that
 * contains it.
 * @implements {BookOrBookContainer}
 */
export class Book extends EventTarget {
  /**
   * @param {string} name
   * @param {string|File|FileSystemFileHandle} uriOrFileHandle For files loaded via URI, this param
   *    contains the URI. For files loaded via a file input element, this contains the File object,
   *    for files loaded via the native file system, it contains the FileSystemFileHandle.
   * @param {BookContainer} bookContainer An optional BookContainer that contains this Book.
   */
  constructor(name, uriOrFileHandle = undefined, bookContainer = undefined) {
    super();

    /**
     * The name of the book (shown in the Reading Stack).
     * @private
     * @type {String}
     */
    this.name_ = name;

    /**
     * The optional URI of the book (not set for a book loaded from the file system).
     * @private
     * @type {String}
     */
    this.uri_ = typeof(uriOrFileHandle) === 'string' ? uriOrFileHandle : undefined;

    /**
     * The File object of the book.
     * @private
     * @type {File}
     */
    this.file_ = (uriOrFileHandle instanceof File) ? uriOrFileHandle : undefined;

    /**
     * The optional FileSystemFileHandle of the book (not set for book loaded from a URI).
     * @private
     * @type {FileSystemFileHandle}
     */
    this.fileHandle_ = (!this.uri_ && !this.file_) ? uriOrFileHandle : undefined;

    /**
     * @private
     * @type {BookContainer}
     */
    this.bookContainer_ = bookContainer;

    /**
     * @private
     * @type {boolean}
     */
    this.needsLoading_ = true;

    /**
     * @private
     * @type {boolean}
     */
     this.finishedBinding_ = false;

    /**
     * @private
     * @type {boolean}
     */
    this.finishedLoading_ = false;

    /**
     * The total known number of pages.
     * @private
     * @type {number}
     */
    this.totalPages_ = 0;

    /**
     * @private
     * @type {BookBinder}
     */
    this.bookBinder_ = null;

    /**
     * @private
     * @type {Array<Page>}
     */
    this.pages_ = [];

    /**
     * @private
     * @type {BookMetadata}
     */
    this.bookMetadata_ = null;

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

  /** @returns {Promise<ArrayBuffer>} */
  getArrayBuffer() {
    return this.arrayBuffer_;
  }

  /** @returns {BookContainer} */
  getContainer() { return this.bookContainer_; }

  /** @returns {FileSystemFileHandle} */
  getFileSystemHandle() { return this.fileHandle_; }

  /** @returns {BookMetadata} */
  getMetadata() { return this.bookMetadata_; }

  /** @returns {string} */
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
   * @returns {Page}
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

  /** @returns {string} */
  getUri() {
    return this.uri_;
  }

  /**
   * Whether the book has finished binding. Binding means the book is fully loaded, has been
   * unarchived, paginated, its metadata inflated, etc.
   * @returns {boolean}
   */
  isFinishedBinding() {
    return this.finishedBinding_;
  }

  /**
   * Whether the book has finished loading (from disk, network, etc).
   * @returns {boolean}
   */
  isFinishedLoading() {
    return this.finishedLoading_;
  }

  /**
   * Loads the file from its source (either XHR or File).
   * @returns {Promise<Book>}
   */
  async load() {
    if (this.uri_) {
      return this.loadFromXhr();
    } else if (this.file_ || this.fileHandle_) {
      return this.loadFromFile();
    }
    throw 'Could not load Book: no uri or File or FileHandle';
  }

  /**
   * Starts an XHR and progressively loads in the book.
   * TODO: Get rid of this and just use loadFromFetch() everywhere.
   * @param {Number} expectedSize If -1, the total field from the XHR Progress event is used.
   * @param {Object<string, string>} headerMap A map of request header keys and values.
   * @returns {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  loadFromXhr(expectedSize = -1, headerMap = {}) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via XHR when the Book is already loading or loaded';
    }
    if (!this.uri_) {
      throw 'URI for book was not set from loadFromXhr()';
    }

    this.needsLoading_ = false;
    this.dispatchEvent(new BookLoadingStartedEvent(this));

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
          this.dispatchEvent(new BookProgressEvent(this, this.pages_.length));
        }
      };
      xhr.onload = (evt) => {
        const ab = evt.target.response;
        this.startBookBinding_(this.uri_, ab, expectedSize);
        this.finishedLoading_ = true;
        this.dispatchEvent(new BookLoadingCompleteEvent(this));
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
   * @returns {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  loadFromFetch(expectedSize, init) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via XHR when the Book is already loading or loaded';
    }
    if (!this.uri_) {
      throw 'URI for book was not set in loadFromFetch()';
    }

    this.needsLoading_ = false;
    this.dispatchEvent(new BookLoadingStartedEvent(this));

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
            this.dispatchEvent(new BookLoadingCompleteEvent(this));
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
   * @returns {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  async loadFromFile() {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via File when the Book is already loading or loaded';
    }
    if (this.uri_) {
      throw 'URI for book was set in loadFromFile()';
    }
    if (!this.file_ && !this.fileHandle_) {
      throw 'Neither file nor fileHandle was set inside Book constructor.';
    }

    // Set this immediately (before awaiting the file handle) so the ReadingStack does not try
    // to also load it.
    this.needsLoading_ = false;
    const file = this.file_ || await this.fileHandle_.getFile();
    this.dispatchEvent(new BookLoadingStartedEvent(this));

    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const ab = fr.result;
        try {
          this.startBookBinding_(file.name, ab, ab.byteLength);
          this.finishedLoading_ = true;
          this.dispatchEvent(new BookLoadingCompleteEvent(this));
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
   * @returns {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
   */
  loadFromArrayBuffer(fileName, ab) {
    if (!this.needsLoading_) {
      throw 'Cannot try to load via File when the Book is already loading or loaded';
    }
    if (this.uri_) {
      throw 'URI for book was set in loadFromArrayBuffer()';
    }

    this.needsLoading_ = false;
    this.dispatchEvent(new BookLoadingStartedEvent(this));
    this.startBookBinding_(fileName, ab, ab.byteLength);
    this.finishedLoading_ = true;
    this.dispatchEvent(new BookLoadingCompleteEvent(this));
    return Promise.resolve(this);
  }

  /**
   * @param {string} bookUri
   * @param {BookPump} bookPump
   * @returns {Promise<Book>} A Promise that returns this book when all bytes have been fed to it.
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
      // If we get any error, reject the promise to create a book.
      bookPump.addEventListener(BookPumpEventType.BOOKPUMP_ERROR, evt => reject(evt.err));

      const handleBookPumpEvents = (evt) => {
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
                this.dispatchEvent(new BookLoadingCompleteEvent(this));
                resolve(this);
                break;
            }
          });
        }
      };
      
      bookPump.addEventListener(BookPumpEventType.BOOKPUMP_DATA_RECEIVED, handleBookPumpEvents);
      bookPump.addEventListener(BookPumpEventType.BOOKPUMP_END, handleBookPumpEvents);
    });
  }

  /**
   * @returns {boolean} True if this book has not started loading, false otherwise.
   */
  needsLoading() {
    return this.needsLoading_;
  }

  /**
   * @param {BookMetata} metadata 
   */
  setMetadata(metadata) {
    this.bookMetadata_ = metadata.clone();
  }

  /**
   * Creates and sets the BookBinder, subscribes to its events, and starts the book binding process.
   * This function is called by all loadFrom... methods.
   * @param {string} fileNameOrUri
   * @param {ArrayBuffer} ab Starting buffer of bytes. May be complete or may be partial depending
   *                         on which loadFrom... method was called.
   * @param {number} totalExpectedSize
   * @returns {Promise<BookBinder>}
   * @private
   */
  startBookBinding_(fileNameOrUri, ab, totalExpectedSize) {
    this.arrayBuffer_ = ab;
    return createBookBinderAsync(fileNameOrUri, ab, totalExpectedSize).then(bookBinder => {
      this.bookBinder_ = bookBinder;
      this.bookMetadata_ = createEmptyMetadata(bookBinder.getBookType());

      // Extracts state from some BookBinder events and update the Book. Re-source some of those
      // events, and dispatch them out to the subscribers of this Book. Only some events are
      // propagated from the BookBinder events (those that affect the UI, essentially).

      this.bookBinder_.addEventListener(BookEventType.BINDING_COMPLETE, evt => {
        this.finishedBinding_ = true;
        this.dispatchEvent(new BookBindingCompleteEvent(this));
      });

      this.bookBinder_.addEventListener(BookEventType.METADATA_XML_EXTRACTED, evt => {
        this.bookMetadata_ = evt.bookMetadata;
      });

      this.bookBinder_.addEventListener(BookEventType.PAGE_EXTRACTED, evt => {
        this.pages_.push(evt.page);
        this.dispatchEvent(new BookPageExtractedEvent(this, evt.page, evt.pageNum));
      });

      this.bookBinder_.addEventListener(BookEventType.PROGRESS, evt => {
        if (evt.totalPages) {
          this.totalPages_ = evt.totalPages;
        }
        this.dispatchEvent(new BookProgressEvent(this, evt.totalPages, evt.message));
      });

      this.bookBinder_.start();
    });
  }
}
