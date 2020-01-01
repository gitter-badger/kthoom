/**
 * comic-book-binder.js
 * Licensed under the MIT License
 * Copyright(c) 2019 Google Inc.
 */

import { BookBinder } from './book-binder.js';
import { BookBindingCompleteEvent, BookPageExtractedEvent, BookProgressEvent } from './book-events.js';
import { createPageFromFileAsync } from './page.js';

/**
 * The default BookBinder used in kthoom.  It takes each extracted file from the Unarchiver and
 * turns that directly into a Page for the comic book.
 */
export class ComicBookBinder extends BookBinder {
  constructor(filenameOrUri, ab, totalExpectedSize) {
    super(filenameOrUri, ab, totalExpectedSize);

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
        this.pagePromises_.push(createPageFromFileAsync(evt.unarchivedFile));

        // Emit a Progress event for each unarchived file.
        this.notify(new BookProgressEvent(
          this,
          undefined /* loadingPct */,
          undefined /* unarchivingPct */,
          undefined /* layoutPct */,
          this.pagePromises_.length));

        // Do not send extracted events yet, because the pages may not be in the correct order.
        //this.notify_(new UnarchivePageExtractedEvent(this, newPage, this.pages_.length));
      }
    });
    this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.FINISH, evt => {
      this.setUnarchiveComplete();

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
          return a.pageName.toLowerCase() > b.pageName.toLowerCase() ? 1 : -1;
        });

        // Emit an extract event for each page in its proper order.
        for (let i = 0; i < pages.length; ++i) {
          this.notify(new BookPageExtractedEvent(this, pages[i], i + 1));
        }

        // Emit a complete event.
        this.notify(new BookBindingCompleteEvent(this, pages));
      });

      this.stop();
    });
  }

  /** @override */
  getLayoutPercentage() { return this.getUnarchivingPercentage() * this.getUnarchivingPercentage(); }
}
