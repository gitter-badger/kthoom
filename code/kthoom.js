/*
 * kthoom.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2011 Google Inc.
 * Copyright(c) 2011 antimatter15
 */

import { Book } from './book.js';
import { BookViewer } from './book-viewer.js';
import { ReadingStack } from './reading-stack.js';
import { Key, Params, getElem, createURLFromArray } from './helpers.js';

if (window.kthoom == undefined) {
  window.kthoom = {};
}

const LOCAL_STORAGE_KEY = 'kthoom_settings';
const BOOK_VIEWER_ELEM_ID = 'mainContent';
const READING_STACK_ELEM_ID = 'readingStack';

/**
 * The main class for the kthoom reader.
 */
class KthoomApp {
  constructor() {
    this.bookViewer_ = new BookViewer();
    this.readingStack_ = new ReadingStack();

    this.currentBook_ = null;

    // This Promise resolves when kthoom is ready.
    this.initializedPromise_ = new Promise((resolve, reject) => {
      // This Promise resolves when the DOM is ready.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => resolve(), false);
      } else {
        resolve();
      }
    }).then(() => {
      this.init_();
    });
  }

  /** @private */
  init_() {
    this.readingStack_.whenCurrentBookChanged(book => this.handleCurrentBookChanged_(book));
    this.initMenu_();
    this.initDragDrop_();
    this.initClickHandlers_();
    this.initResizeHandler_();
    this.initWheelScroll_();

    document.addEventListener('keydown', (e) => this.keyHandler_(e), false);

    this.loadSettings_();
    this.parseParams_();

    console.log('kthoom initialized');
  }

  /** @private */
  initMenu_() {
    getElem('menu').addEventListener('click', (e) => e.currentTarget.classList.toggle('opened'));
    getElem('menu-open-local-files').addEventListener('change', (e) => this.loadLocalFiles_(e), false);
    getElem('menu-open-url').addEventListener('click', (e) => this.loadFileViaUrl_(), false);
    getElem('menu-open-google-drive').addEventListener('click', kthoom.google.doDrive, false);
    getElem('menu-open-ipfs-hash').addEventListener('click', kthoom.ipfs.ipfsHashWindow, false);
    getElem('menu-help').addEventListener('click', this.showOrHideHelp_, false);
  }

  /** @private */
  initDragDrop_() {
    const swallowEvent = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('dragenter', swallowEvent, false);
    document.addEventListener('dragexit', swallowEvent, false);
    document.addEventListener('dragover', swallowEvent, false);
    document.addEventListener('drop', (e) => {
      swallowEvent(e);
      this.loadLocalFiles_({target: e.dataTransfer});
    }, false);
  }

  /** @private */
  initClickHandlers_() {
    getElem('mainImage').addEventListener('click', (evt) => {
      // Firefox does not support offsetX/Y so we have to manually calculate
      // where the user clicked in the image.
      const mainContentWidth = getElem('mainContent').clientWidth;
      const mainContentHeight = getElem('mainContent').clientHeight;
      const comicWidth = evt.target.clientWidth;
      const comicHeight = evt.target.clientHeight;
      const offsetX = (mainContentWidth - comicWidth) / 2;
      const offsetY = (mainContentHeight - comicHeight) / 2;
      const clickX = !!evt.offsetX ? evt.offsetX : (evt.clientX - offsetX);
      const clickY = !!evt.offsetY ? evt.offsetY : (evt.clientY - offsetY);

      // Determine if the user clicked/tapped the left side or the
      // right side of the page.
      let clickedPrev = false;
      switch (this.bookViewer_.getRotateTimes()) {
        case 0: clickedPrev = clickX < (comicWidth / 2); break;
        case 1: clickedPrev = clickY < (comicHeight / 2); break;
        case 2: clickedPrev = clickX > (comicWidth / 2); break;
        case 3: clickedPrev = clickY > (comicHeight / 2); break;
      }
      if (clickedPrev) {
        this.showPrevPage();
      } else {
        this.showNextPage();
      }
    }, false);

    // Toolbar
    getElem('prevBook').addEventListener('click', () => this.readingStack_.changeToPrevBook(), false);
    getElem('prev').addEventListener('click', () => this.showPrevPage(), false);
    getElem('toolbarbutton').addEventListener('click', () => this.toggleToolbar(), false);
    getElem('next').addEventListener('click', () => this.showNextPage(), false);
    getElem('nextBook').addEventListener('click', () => this.readingStack_.changeToNextBook(), false);
  }

  /** @private */
  initResizeHandler_() {
    window.addEventListener('resize', () => {
      const f = (window.screen.width - window.innerWidth < 4 &&
                 window.screen.height - window.innerHeight < 4);
      getElem('header').className = f ? 'fullscreen' : '';
      this.bookViewer_.updateScale();
    }, false);
  }

  /** @private */
  initWheelScroll_() {
    window.addEventListener('wheel', (evt) => {
      let target = evt.target;
      while (target != window) {
        if (target.id === BOOK_VIEWER_ELEM_ID) {
          // Deliver the wheel event to the Book Viewer to deal with swipes.
          this.bookViewer_.handleSwipeEvent(evt);
          return;
        } else if (target.id === READING_STACK_ELEM_ID) {
          // Do nothing, let the scroll happen on the ReadingStack.
          return;
        }
        target = target.parentElement;
      }
      evt.preventDefault();
    }, true);
  }

  /** @private */
  parseParams_() {
    // We prefer URL parameters over hashes on the URL.
    const bookUri = Params['bookUri'];
    if (bookUri) {
      // See https://gist.github.com/lgierth/4b2969583b3c86081a907ef5bd682137 for the
      // eventual migration steps for IPFS addressing.  We will support two versions
      // for now, ipfs://$hash and dweb:/ipfs/$hash.
      if (bookUri.indexOf('ipfs://') === 0) {
        kthoom.ipfs.loadHash(bookUri.substr(7));
      } else if (bookUri.indexOf('dweb:/ipfs/') === 0) {
        kthoom.ipfs.loadHash(bookUri.substr(11));
      } else {
        // Else, we assume it is a URL that XHR can handle.
        // TODO: Try fetch first?
        const xhr = new XMLHttpRequest();
        xhr.open('GET', bookUri, true);
        this.loadSingleBookFromXHR(bookUri, xhr, -1);
      }
    } else {
      // TODO: Eventually get rid of this and just rely on the bookUri param.
      const hashcontent = window.location.hash.substr(1);
      if (hashcontent.lastIndexOf('ipfs', 0) === 0) {
        const ipfshash = hashcontent.substr(4);
        kthoom.ipfs.loadHash(ipfshash);
      }
    }
  }

  /** @private */
  loadSettings_() {
    try {
      if (localStorage[LOCAL_STORAGE_KEY].length < 10) return;
      const s = JSON.parse(localStorage[LOCAL_STORAGE_KEY]);
      this.bookViewer_.setRotateTimes(s.rotateTimes);
      this.bookViewer_.setHflip(s.hflip);
      this.bookViewer_.setVflip(s.vflip);
      this.bookViewer_.setFitMode(s.fitMode);
    } catch(err) {}
  }

  /** @private */
  keyHandler_(evt) {
    const code = evt.keyCode;

    // If the overlay is shown, the only keystroke we handle is closing it.
    const overlayShown = getElem('overlay').style.display != 'none';
    if (overlayShown) {
      this.showOrHideHelp_(false);
      return;
    }

    // Handle keystrokes that do not depend on whether a document is loaded.
    if (code == Key.O) {
      getElem('menu-open-local-files-input').click();
      getElem('menu').classList.remove('opened');
    } else if (code === Key.U) {
      this.loadFileViaUrl_();
    } else if (code === Key.G) {
      kthoom.google.doDrive();
    } else if (code === Key.I) {
      kthoom.ipfs.ipfsHashWindow();
    } else if (code === Key.QUESTION_MARK) {
      this.showOrHideHelp_(true);
    }

    if (getComputedStyle(getElem('progress')).display == 'none') return;

    let canKeyNext = ((document.body.offsetWidth+document.body.scrollLeft) / document.body.scrollWidth) >= 1;
    let canKeyPrev = (scrollX <= 0);

    if (evt.ctrlKey || evt.shiftKey || evt.metaKey) return;
    switch(code) {
      case Key.X:
        this.toggleToolbar();
        break;
      case Key.LEFT:
        if (canKeyPrev) this.showPrevPage();
        break;
      case Key.RIGHT:
        if (canKeyNext) this.showNextPage();
        break;
      case Key.LEFT_SQUARE_BRACKET:
        this.readingStack_.changeToPrevBook();
        break;
      case Key.RIGHT_SQUARE_BRACKET:
        this.readingStack_.changeToNextBook();
        break;
      case Key.L:
        this.bookViewer_.rotateCounterClockwise();
      break;
      case Key.R:
        this.bookViewer_.rotateClockwise();
        break;
      case Key.F:
        this.bookViewer_.flip();
        break;
      case Key.W: case Key.H: case Key.B: case Key.N:
        this.bookViewer_.setFitMode(code);
        this.saveSettings_();
        break;
      default:
        break;
    }
  }

  /**
   * @param {boolean} show Whether to show help.  Defaults to true.
   * @private
   */
  showOrHideHelp_(show = true) {
    getElem('overlay').style.display = show ? 'block' : 'none';
  }

  /** @private */
  saveSettings_() {
    localStorage[LOCAL_STORAGE_KEY] = JSON.stringify({
      rotateTimes: this.bookViewer_.getRotateTimes(),
      hflip: this.bookViewer_.isHflip(),
      vflip: this.bookViewer_.isVflip(),
      fitMode: this.bookViewer_.getFitMode(),
    });
  }

  setProgressMeter({loadPct = 0, unzipPct = 0, label = ''} = {}) {
    this.bookViewer_.setProgressMeter({loadPct, unzipPct, label});
  }

  toggleToolbar() {
    getElem('header').classList.toggle('fullscreen');
    this.bookViewer_.updateScale();
  }

  showPrevPage() {
    const turnedPage = this.bookViewer_.showPrevPage();
    if (!turnedPage) {
      if (this.readingStack_.getNumberOfBooks() == 1) {
        this.bookViewer_.showPage(this.currentBook_.getNumberOfPages() - 1);
      } else {
        this.readingStack_.changeToPrevBook();
      }
    }
  }

  showNextPage() {
    const turnedPage = this.bookViewer_.showNextPage();
    if (!turnedPage) {
      if (this.readingStack_.getNumberOfBooks() == 1) {
        this.bookViewer_.showPage(0);
      } else {
        this.readingStack_.changeToNextBook();
      }
    }
  }

  /**
   * Attempts to read the files that the user has chosen.
   * @private
   */
  loadLocalFiles_(evt) {
    const filelist = evt.target.files;

    // Add the first book immediately so it unarchives asap.
    if (filelist.length >= 1) {
      Book.fromFile(filelist[0]).then(book => {
        this.readingStack_.addBook(book);
        this.readingStack_.show(true);
      });
    }

    if (filelist.length > 1) {
      const bookPromises = [];
      for (let fileNum = 1; fileNum < filelist.length; ++fileNum) {
        bookPromises.push(Book.fromFile(filelist[fileNum]));
      }

      Promise.all(bookPromises).then(books => {
        if (books.length > 0) {
          this.readingStack_.addBooks(books, false /* switchToFirst */);
        }
      });
    }
  }

  /**
   * Asks the user for a URL to load and then loads it.
   */
  loadFileViaUrl_() {
    const bookUrl = window.prompt('Enter the URL of the book to load');
    if (bookUrl) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', bookUrl, true);
      this.loadSingleBookFromXHR(bookUrl, xhr, -1);
    }
  }

  /**
   * @param {string} name The book name.
   * @param {XMLHttpRequest} xhr XHR ready with the method, url and header.
   * @param {number} expectedSize Unarchived size in bytes.  If -1, then the
   *     data from the XHR progress events is used.
   */
  loadSingleBookFromXHR(name, xhr, expectedSize) {
    Book.fromXhr(name, xhr, expectedSize).then(book => {
      this.readingStack_.show(true);
      this.readingStack_.addBook(book);
    });
  }

  /**
   * @param {string} name The book name.
   * @param {string} url The resource to fetch.
   * @param {Object} init An object to initialize the Fetch API.
   * @param {number} expectedSize Unarchived size in bytes.
   */
  loadSingleBookFromFetch(name, url, init, expectedSize) {
    if (!window['fetch'] || !window['Response'] || !window['ReadableStream']) {
      throw 'No browser support for fetch/ReadableStream';
    }

    Book.fromFetch(name, url, init, expectedSize).then(book => {
      this.readingStack_.show(true);
      this.readingStack_.addBook(book);
    });
  }

  /**
   * @param {string} name
   * @param {ArrayBuffer} ab
   */
  loadSingleBookFromArrayBuffer(name, ab) {
    Book.fromArrayBuffer(name, ab).then(book => {
      this.readingStack_.show(true);
      this.readingStack_.addBook(book);
    });
  }

  /**
   * @param {Book} book
   * @private
   */
  handleCurrentBookChanged_(book) {
    if (book !== this.currentBook_) {
      this.bookViewer_.closeBook();

      // hide logo
      getElem('logo').setAttribute('style', 'display:none');

      this.currentBook_ = book;
      this.bookViewer_.setCurrentBook(book);
    }
  }
}

const theApp = new KthoomApp();

if (!window.kthoom.getApp) {
  window.kthoom.getApp = () => theApp;
}
