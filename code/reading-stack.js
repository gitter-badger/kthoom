/**
 * reading-stack.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */
import { getElem } from './helpers.js';
import { Book, BookContainer } from './book.js';
import { BookEventType } from './book-events.js';

// TODO: Have the ReadingStack display progress bars in the pane as books load and unarchive.

/**
 * The ReadingStack is responsible for displaying information about the current
 * set of books the user has in their stack as well as the book they are
 * currently reading.  It also provides methods to add, remove and get a book.
 */
export class ReadingStack {
  constructor() {
    /** @type {Array<Book>} */
    this.books_ = [];

    /** @type {number} */
    this.currentBookNum_ = -1;

    /** @type {Array<Function>} */
    this.currentBookChangedCallbacks_ = [];

    /** @type {Array<Function>} */
    this.currentBookLoadedCallbacks_ = [];

    getElem('readingStackButton').addEventListener('click', () => this.toggleOpen());
    getElem('readingStackOverlay').addEventListener('click', () => this.toggleOpen());
  }

  /** @returns {number} The number of books in the stack. */
  getNumberOfBooks() { return this.books_.length; }

  /** @returns {number} The current book number, zero-based. */
  getCurrentBook() {
    return this.currentBookNum_ != -1 ? this.books_[this.currentBookNum_] : null;
  }

  /**
   * @param {number} i The book to get, zero-based.
   * @returns {Book} The Book, or null, if i was invalid.
   */
  getBook(i) {
    if (i < 0 || i >= this.books_.length) return null;
    return this.books_[i];
  }

  /**
   * Always changes to the newly added book.
   * @param {Book} book
   * @param {boolean} switchToThisBook Whether to switch to this book.
   */
  addBook(book, switchToThisBook = false) {
    this.books_.push(book);
    book.subscribe(this, () => this.renderStack_(), BookEventType.LOADING_STARTED);
    if (switchToThisBook) {
      this.changeToBook_(this.books_.length - 1);
    }
    this.renderStack_();
  }

  /**
   * @param {Array<Book>} books
   * @param {Number} bookNumber The book within the books array to load.
   */
  addBooks(books, bookNumber = 0) {
    if (books.length > 0) {
      const newCurrentBook = this.books_.length;
      for (const book of books) {
        this.books_.push(book);
        book.subscribe(this, () => this.renderStack_(), BookEventType.LOADING_STARTED);
      }
      if (bookNumber < 0 || bookNumber >= this.books_.length) {
        bookNumber = 0;
      }
      this.changeToBook_(newCurrentBook + bookNumber);
      this.renderStack_();
    }
  }

  /**
   * @param {BookContainer} folder
   */
  addFolder(folder) {
    let sortedEntries = folder.entries.slice(0);
    sortedEntries.sort((a, b) => {
      return a.getName() < b.getName() ? -1 : 1;
    });
    for (const entry of sortedEntries) {
      if (entry instanceof BookContainer) {
        this.addFolder(entry);
      } else {
        this.addBook(entry, this.books_.length === 0);
      }
    }
  }

  /**
   * Removes all books, resets the internal state, and re-renders.
   * Does not remove the current book change callback.
   */
  removeAll() {
    for (const book of this.books_) {
      book.unsubscribe(this, BookEventType.LOADING_STARTED);
    }
    this.books_ = [];
    this.currentBookNum_ = -1;
    this.renderStack_();
  }

  /** @param {number} i */
  removeBook(i) {
    // Cannot remove the very last book.
    if (this.books_.length > 1 && i < this.books_.length) {
      this.books_[i].unsubscribe(this, BookEventType.LOADING_STARTED);
      this.books_.splice(i, 1);

      // If we are removing the book we are on, pick a new current book.
      if (i === this.currentBookNum_) {
        // Default to going to the next book unless we were on the last book
        // (in which case you go to the previous book).
        if (i >= this.books_.length) {
          i = this.books_.length - 1;
        }

        this.changeToBook_(i);
      } else {
        // Might have to update the current book number if the book removed
        // was above the current one.
        if (i < this.currentBookNum_) {
          this.currentBookNum_--;
        }
        this.renderStack_();
      }
    }
  }

  whenCurrentBookChanged(callback) {
    this.currentBookChangedCallbacks_.push(callback);
  }

  whenCurrentBookHasLoaded(callback) {
    this.currentBookLoadedCallbacks_.push(callback);
  }

  /** @returns {boolean} */
  isOpen() {
    return getElem('readingStack').classList.contains('opened');
  }

  changeToPrevBook() {
    if (this.currentBookNum_ > 0) {
      this.changeToBook_(this.currentBookNum_ - 1);
    }
  }

  changeToNextBook() {
    if (this.currentBookNum_ < this.books_.length - 1) {
      this.changeToBook_(this.currentBookNum_ + 1);
    }
  }

  /**
   * @param {number} i
   * @private
   */
  changeToBook_(i) {
    if (i >= 0 && i < this.books_.length) {
      this.currentBookNum_ = i;
      const book = this.books_[i];
      if (book.needsLoading()) {
        book.load();
      }

      for (const callback of this.currentBookChangedCallbacks_) {
        callback(book);
      }

      if (this.currentBookChangedCallbacks_.length > 0) {
        if (book.isFinishedLoading()) {
          this.currentBookLoadedCallbacks_.forEach(callback => callback(book));
        } else {
          book.subscribe(this, () => {
            book.unsubscribe(this, BookEventType.LOADING_COMPLETE);
            this.currentBookLoadedCallbacks_.forEach(callback => callback(book));
          }, BookEventType.LOADING_COMPLETE);
        }
      }

      // Re-render to update selected highlight.
      this.renderStack_();

      if (this.isOpen()) {
        this.toggleOpen();
      }
    }
  }

  toggleOpen() {
    getElem('readingStack').classList.toggle('opened');
    getElem('readingStackOverlay').classList.toggle('hidden');

    if (this.isOpen()) {
      const bookElems = getElem('readingStack').querySelectorAll('.readingStackBook');
      if (bookElems.length > 0) {
        bookElems.item(0).focus();
      }
    }
  }

  // TODO: Do this better so that each change of state doesn't require a complete re-render?
  /** @private */
  renderStack_() {
    const renderedContainers = [];
    const libDiv = getElem('readingStackContents');
    // Clear out the current reading stack HTML divs.
    libDiv.innerHTML = '';
    // TODO: Do this out of the rendering thread and send ~200 books at a time into the DOM.
    if (this.books_.length > 0) {
      for (let i = 0; i < this.books_.length; ++i) {
        let indentLevel = 0;
        const book = this.books_[i];

        // If this book's containers have not been rendered yet, go up the ancestry and render
        // all its unrendered containers in order.
        if (book.getContainer()) {
          let ancestors = [];

          // Find all ancestors and the indent-level of the book.
          let cur = book.getContainer();
          while (cur) {
            ancestors.push(cur);
            cur = cur.getContainer();
          }
          indentLevel = ancestors.length;

          // Now, in reverse order, render the ancestors.
          for (let i = ancestors.length - 1; i >= 0; --i) {
            const ancestor = ancestors[i];
            // Skip already-rendered containers.
            if (renderedContainers.includes(ancestor)) {
              continue;
            }
            renderedContainers.push(ancestor);
            const folderDiv = document.createElement('div');
            folderDiv.classList.add('readingStackFolder');
            folderDiv.textContent = ancestor.getName();
            folderDiv.innerHTML = '&nbsp;&nbsp;&nbsp;'.repeat(ancestors.length - 1 - i) + folderDiv.innerHTML;
            libDiv.appendChild(folderDiv);
          }
        }

        const bookDiv = document.createElement('div');
        bookDiv.classList.add('readingStackBook');
        if (!book.needsLoading()) {
          bookDiv.classList.add('loaded');
        }
        if (this.currentBookNum_ == i) {
          bookDiv.classList.add('current');
        }
        bookDiv.dataset.index = i;
        bookDiv.innerHTML =
          '<div class="readingStackBookInner" title="' + book.getName() + '">' +
          '&nbsp;&nbsp;&nbsp;'.repeat(indentLevel) +
          book.getName() +
          '</div>' +
          '<div class="readingStackBookCloseButton" title="Remove book from stack">x</div>';

        // Handle drag-drop of books.
        bookDiv.setAttribute('draggable', 'true');
        bookDiv.addEventListener('dragstart', evt => {
          evt.stopPropagation();
          const thisBookDiv = evt.target;
          thisBookDiv.classList.add('dragging');
          evt.dataTransfer.effectAllowed = 'move';
          evt.dataTransfer.setData('text/plain', thisBookDiv.dataset.index);
        });
        bookDiv.addEventListener('dragend', evt => {
          evt.stopPropagation();
          evt.target.classList.remove('dragging');
        });
        bookDiv.addEventListener('dragenter', evt => {
          evt.stopPropagation();
          evt.target.classList.add('dropTarget');
        });
        bookDiv.addEventListener('dragleave', evt => {
          evt.stopPropagation();
          evt.target.classList.remove('dropTarget');
        });
        bookDiv.addEventListener('dragover', evt => {
          evt.stopPropagation();
          evt.preventDefault();
        });
        bookDiv.addEventListener('drop', evt => {
          evt.stopPropagation();

          const dropBookDiv = evt.target;
          const fromIndex = parseInt(evt.dataTransfer.getData('text/plain'), 10);
          const toIndex = parseInt(dropBookDiv.dataset.index, 10);

          if (fromIndex !== toIndex) {
            const draggedBook = this.books_[fromIndex];
            const currentBook = this.books_[this.currentBookNum_];
            this.books_.splice(fromIndex, 1);
            this.books_.splice(toIndex, 0, draggedBook);
            this.currentBookNum_ = this.books_.indexOf(currentBook);
            this.renderStack_();
          }
        });

        bookDiv.addEventListener('click', (evt) => {
          const i = parseInt(evt.currentTarget.dataset.index, 10);
          if (evt.target.classList.contains('readingStackBookCloseButton')) {
            this.removeBook(i);
          } else {
            this.changeToBook_(i);
          }
        });
        libDiv.appendChild(bookDiv);
      }
    } else {
      libDiv.innerHTML = 'No books loaded';
      // TODO: Display a label indicating no books loaded again.
    }
  }
}
