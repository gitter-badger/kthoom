import { getElem } from './helpers.js';

/**
 * The ReadingStack is responsible for displaying information about the current set of books the
 * user has in their stack as well as the book they are currently reading.  It also provides
 * methods to add, remove and get a book.
 */
export class ReadingStack {
  constructor() {
    this.books_ = [];
    this.bookSelectedCallbacks_ = [];

    this.readingStackEl_ = getElem('readingStack');
    getElem('readingStackTab')
        .addEventListener('click', () => this.toggleReadingStackOpen_(), false);
  }

  getNumberOfBooks() { return this.books_.length; }

  getBook(i) {
    if (i < 0 || i >= this.books_.length) return null;
    return this.books_[i];
  }

  addBook(book) { this.books_.push(book); }

  whenBookSelected(callback) {
    this.bookSelectedCallbacks_.push(callback);
  }

  /** @private */
  toggleReadingStackOpen_() {
    this.readingStackEl_.classList.toggle('opened');
  }
}
