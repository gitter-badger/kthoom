/**
 * book-binder.js
 * Licensed under the MIT License
 * Copyright(c) 2019 Google Inc.
 */

import {BookPageExtractedEvent, BookProgressEvent, BookBindingCompleteEvent} from './book-events.js';
import {EventEmitter} from './event-emitter.js';
import {createPageFromFile} from './page.js';

const UnarchiveState = {
  UNARCHIVING_NOT_YET_STARTED: 0,
  UNARCHIVING: 1,
  UNARCHIVED: 2,
  UNARCHIVING_ERROR: 3,
};

/**
 * The abstract class for a BookBinder.  Never instantiate one of these yourself.
 * Use createBookBinder() to create an instance of an implementing subclass.
 */
export class BookBinder extends EventEmitter {
  /**
   * @param {ArrayBuffer} ab The ArrayBuffer to initialize the BookBinder.
   * @param {numbeer} totalExpectedSize The total number of bytes expected.
   */
  constructor(ab, totalExpectedSize) {
    super();

    // totalExpectedSize can be -1 in the case of an XHR where we do not know the size yet.
    if (!totalExpectedSize || totalExpectedSize < -2) {
      throw 'Must initialize a BookBinder with a valid totalExpectedSize';
    }
    if (!ab || !(ab instanceof ArrayBuffer)) {
      throw 'Must initialize a BookBinder with an ArrayBuffer';
    }
    if (totalExpectedSize > 0 && ab.byteLength > totalExpectedSize) {
      throw 'Must initialize a BookBinder with a ab.byteLength <= totalExpectedSize';
    }

    /** @protected {number} */
    this.startTime_ = undefined;

    /** @private {number} */
    this.bytesLoaded_ = ab.byteLength;

    /** @private {number} */
    this.totalExpectedSize_ = totalExpectedSize > 0 ? totalExpectedSize : this.bytesLoaded_;

    /** 
     * A number between 0 and 1 indicating the progress of the Unarchiver.
     * @protected {number}
     */
    this.unarchivingPercentage_ = 0;

    /** @private {UnarchiveState} */
    this.unarchiveState_ = UnarchiveState.UNARCHIVING_NOT_YET_STARTED;

    /** @private {bitjs.archive.Unarchiver} */
    this.unarchiver_ = bitjs.archive.GetUnarchiver(ab, 'code/bitjs/');
    if (!this.unarchiver_) {
      throw 'Could not determine the unarchiver to use';
    }
  }

  /**
   * Appends more bytes to the binder for processing.
   * @param {ArrayBuffer} ab
   */
  appendBytes(ab) {
    if (!ab) {
      throw 'Must pass a valid ArrayBuffer to appendBytes()';
    }
    if (!this.unarchiver_) {
      throw 'Called appendBytes() without a valid Unarchiver set';
    }
    if (this.bytesLoaded_ + ab.byteLength > this.totalExpectedSize_) {
      throw 'Tried to add bytes larger than totalExpectedSize in appendBytes()';
    }

    this.unarchiver_.update(ab);
    this.bytesLoaded_ += ab.byteLength;
  }

  /**
   * Oveerride this in an implementing subclass to do things before the Unarchiver starts
   * (like subscribe to Unarchiver events).
   * @protected
   */
  beforeStart_() {
    throw 'Cannot call beforeStart_() in abstract BookBinder';
  }

  getLoadingPercentage() { return this.bytesLoaded_ / this.totalExpectedSize_; }
  getUnarchivingPercentage() { return this.unarchivingPercentage_; }

  setNewExpectedSize(bytesDownloaded, newExpectedSize) {
    this.bytesLoaded_ = bytesDownloaded;
    this.totalExpectedSize_ = newExpectedSize;
  }

  /**
   * Starts the binding process.
   */
  start() {
    if (!this.unarchiver_) {
      throw 'Called start() without a valid Unarchiver';
    }

    this.startTime_ = (new Date).getTime();

    this.unarchiveState_ = UnarchiveState.UNARCHIVING;
    this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.PROGRESS, evt => {
      this.unarchivingPercentage_ = evt.totalCompressedBytesRead / this.totalExpectedSize_;
      this.notify(new BookProgressEvent(
          this,
          this.bytesLoaded_ / this.totalExpectedSize_,
          this.unarchivingPercentage_,
          this.totalPages = evt.totalFilesInArchive));
    });

    this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.INFO,
        evt => console.log(evt.msg));

    this.beforeStart_();
    this.unarchiver_.start();
  }

  /**
   * Must be called from the implementing subclass of BookBinder.
   */
  stop() {
    // Stop the Unarchiver (which will kill the worker) and then delete the unarchiver
    // which should free up some memory, including the unarchived array buffer.
    this.unarchiver_.stop();
    this.unarchiver_ = null;
  }
}

/**
 * The default BookBinder used in kthoom.  It takes each extracted file from the Unarchiver and
 * turns that directly into a Page for the comic book.
 */
class ComicBookBinder extends BookBinder {
  constructor(ab, totalExpectedSize) {
    super(ab, totalExpectedSize);

    // As each file becomes available from the Unarchiver, we kick off an async operation
    // to construct a Page object.  After all pages are retrieved, we sort them.
    /** @private {Promise<Page>} */
    this.pagePromises_ = [];
  }

  /** @override */
  beforeStart_() {
    this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.EXTRACT, evt => {
      // Convert each unarchived file into a Page.
      // TODO: Error if not present?
      if (evt.unarchivedFile) {
        // TODO: Error if we have more pages than totalPages_.
        this.pagePromises_.push(createPageFromFile(evt.unarchivedFile));

        // Do not send extracted events yet, because the pages may not be in the correct order.
        //this.notify_(new UnarchivePageExtractedEvent(this, newPage, this.pages_.length));
      }
    });
    this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.FINISH, evt => {
      this.unarchiveState_ = UnarchiveState.UNARCHIVED;
      this.unarchivingPercentage_ = 1.0;
      const diff = ((new Date).getTime() - this.startTime_)/1000;
      console.log(`Book = '${this.name_}'`);
      console.log(`  using ${this.unarchiver_.getScriptFileName()}`);
      console.log(`  unarchiving done in ${diff}s`);

      let pages = [];
      let foundError = false;
      let pagePromiseChain = Promise.resolve(true);
      for (let pageNum = 0; pageNum < this.pagePromises_.length; ++pageNum) {
        pagePromiseChain = pagePromiseChain.then(() => {
          return this.pagePromises_[pageNum]
              .then(page => pages.push(page))
              .catch(e => foundError = true)
              .finally(() => true);
        });
      }

      pagePromiseChain.then(() => {
        console.log(`  number of pages = ${pages.length}`);

        if (foundError) {
          // TODO: Better error handling.
          alert('Some pages had errors. See the console for more info.')
        }

        // Sort the book's pages based on filename.
        pages = pages.slice(0).sort((a,b) => {
          return a.filename.toLowerCase() > b.filename.toLowerCase() ? 1 : -1;
        });

        // Issuing an extract event for each page in its proper order.
        for (let i = 0; i < pages.length; ++i) {
          this.notify(new BookPageExtractedEvent(this, pages[i], i + 1));
        }

        // Emit a complete event.
        this.notify(new BookBindingCompleteEvent(this, pages));
      });

      this.stop();
    });
  }
}

/**
 * Creates a book binder based on the type of book.  Determiens the type of unarchiver to use by
 * looking at the first bytes.  Guesses the type of book by looking at the file/uri name.
 * @param {string} fileNameOrUri The filename or URI.  Must end in a file extension that can be
 *     used to guess what type of book this is.
 * @param {ArrayBuffer} ab The initial ArrayBuffer to start the unarchiving process.
 * @param {number} totalExpectedSize Thee total expected size of the archived book in bytes.
 */
export function createBookBinder(fileNameOrUri, ab, totalExpectedSize) {
  // TODO: Do book type checking here.
  return new ComicBookBinder(ab, totalExpectedSize);
}
