/**
 * reading-stack.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */
import { getElem } from './helpers.js';

// TODO: Have the ReadStack scrollable for long reading lists.
// TODO: Have a removeBook() method that unsubscribes, removes and re-renders.
// TODO: Have the ReadingStack subscribe to all of its book events.
// TODO: Have the ReadingStack display progress bars in the pane as books load
//       and unarchive.

/**
 * The ReadingStack is responsible for displaying information about the current
 * set of books the user has in their stack as well as the book they are
 * currently reading.  It also provides methods to add, remove and get a book.
 */
export class ReadingStack {
  constructor() {
    this.books_ = [];
    this.currentBookNum_ = -1;
    this.currentBookChangedCallbacks_ = [];

    getElem('readingStackTab')
        .addEventListener('click', () => this.toggleReadingStackOpen_(), false);
  }

  getNumberOfBooks() { return this.books_.length; }

  getCurrentBook() {
    return this.currentBookNum_ != -1 ? this.books_[this.currentBookNum_] : null;
  }

  getBook(i) {
    if (i < 0 || i >= this.books_.length) return null;
    return this.books_[i];
  }

  /**
   * Always changes to the newly added book.
   * @param {Book} book
   */
  addBook(book) {
    this.books_.push(book);
    this.changeToBook_(this.books_.length - 1);
    this.renderStack_();
  }

  /**
   * @param {Array<Book>} books
   * @param {boolean} switchToFirst Whether to switch to the first book in this new set.
   */
  addBooks(books, switchToFirst) {
    if (books.length > 0) {
      const newCurrentBook = this.books_.length;
      for (const book of books) {
        this.books_.push(book);
      }
      if (switchToFirst) {
        this.changeToBook_(newCurrentBook);
      }
      this.renderStack_();
    }
  }

  whenCurrentBookChanged(callback) {
    this.currentBookChangedCallbacks_.push(callback);
  }

  /**
   * @param {boolean} show
   */
  show(show) {
    getElem('readingStack').style.visibility = (show ? 'visible' : 'hidden');
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
      for (const callback of this.currentBookChangedCallbacks_) {
        callback(book);
      }
      // Re-render to update selected highlight.
      this.renderStack_();
    }
  }

  /** @private */
  toggleReadingStackOpen_() {
    getElem('readingStack').classList.toggle('opened');
  }

  // TODO: Do this better so that each change of state doesn't require a complete re-render?
  /** @private */
  renderStack_() {
    const libDiv = getElem('readingStackContents');
    // Clear out the current reading stack HTML divs.
    libDiv.innerHTML = '';
    if (this.books_.length > 0) {
      for (let i = 0; i < this.books_.length; ++i) {
        const book = this.books_[i];
        const bookDiv = document.createElement('div');
        bookDiv.classList.add('readingStackBook');
        if (this.currentBookNum_ == i) {
          bookDiv.classList.add('current');
        }
        bookDiv.dataset.index = i;
        bookDiv.innerHTML = book.getName();
        bookDiv.addEventListener('click', (evt) => {
          this.changeToBook_(parseInt(evt.target.dataset.index, 10));
        });
        libDiv.appendChild(bookDiv);
      }
    }
  }
}
