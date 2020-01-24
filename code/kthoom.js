/*
 * kthoom.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2011 Google Inc.
 * Copyright(c) 2011 antimatter15
 */

import { Book } from './book.js';
import { BookViewer, FitMode } from './book-viewer.js';
import { Menu, MenuEventType } from './menu.js';
import { ReadingStack } from './reading-stack.js';
import { Key, Params, getElem } from './helpers.js';

if (window.kthoom == undefined) {
  window.kthoom = {};
}

const LOCAL_STORAGE_KEY = 'kthoom_settings';
const BOOK_VIEWER_ELEM_ID = 'bookViewer';
const READING_STACK_ELEM_ID = 'readingStack';

/**
 * The main class for the kthoom reader.
 */
class KthoomApp {
  constructor() {
    this.bookViewer_ = new BookViewer();
    this.readingStack_ = new ReadingStack();

    this.currentBook_ = null;

    /** @private {Menu} */
    this.mainMenu_ = null;

    /** @private {Menu} */
    this.openMenu_ = null;

    /** @private {Menu} */
    this.viewMenu_ = null;

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
    this.initMenus_();
    this.initNav_();
    this.initDragDrop_();
    this.initClickHandlers_();
    this.initResizeHandler_();
    this.initWheelScroll_();
    this.initUnloadHandler_();

    document.addEventListener('keydown', (e) => this.keyHandler_(e), false);

    this.loadSettings_();
    this.parseParams_();

    getElem('main-menu-button').focus();

    console.log('kthoom initialized');
  }

  /** @private */
  initMenus_() {
    this.mainMenu_ = new Menu(getElem('mainMenu'));
    this.openMenu_ = new Menu(getElem('openMenu'));
    this.viewMenu_ = new Menu(getElem('viewMenu'));

    this.mainMenu_.addSubMenu('menu-open', this.openMenu_);
    this.mainMenu_.addSubMenu('menu-view', this.viewMenu_);
    const closeMainMenu = () => {
      if (this.mainMenu_.isOpen()) {
        this.mainMenu_.close();
      }
    };

    this.openMenu_.subscribe(this, evt => {
      switch (evt.item.id) {
        case 'menu-open-local-files': fileInput.click(); closeMainMenu(); break;
        case 'menu-open-url': this.loadFileViaUrl_(); closeMainMenu(); break;
        case 'menu-open-google-drive': kthoom.google.doDrive(); closeMainMenu(); break;
        case 'menu-open-ipfs-hash': kthoom.ipfs.ipfsHashWindow(); closeMainMenu(); break;
      }
    }, MenuEventType.ITEM_SELECTED);

    this.viewMenu_.subscribe(this, evt => {
      const id = evt.item.id;
      switch (id) {
        case 'menu-view-rotate-left':
          this.bookViewer_.rotateCounterClockwise();
          this.saveSettings_();
          closeMainMenu();
          break;
        case 'menu-view-rotate-right':
          this.bookViewer_.rotateClockwise();
          this.saveSettings_();
          closeMainMenu();
          break;
        case 'menu-view-one-page':
          this.bookViewer_.setNumPagesInViewer(1);
          this.viewMenu_.setMenuItemSelected('menu-view-one-page', true);
          this.viewMenu_.setMenuItemSelected('menu-view-two-page', false);
          this.saveSettings_();
          closeMainMenu();
          break;
        case 'menu-view-two-page':
          this.bookViewer_.setNumPagesInViewer(2);
          this.viewMenu_.setMenuItemSelected('menu-view-one-page', false);
          this.viewMenu_.setMenuItemSelected('menu-view-two-page', true);
          this.saveSettings_();
          closeMainMenu();
          break;
        case 'menu-view-fit-best':
        case 'menu-view-fit-height':
        case 'menu-view-fit-width':
          const fitMode = (id === 'menu-view-fit-best'   ? FitMode.Best :
                           id === 'menu-view-fit-height' ? FitMode.Height :
                           id === 'menu-view-fit-width'  ? FitMode.Width : undefined);
          this.bookViewer_.setFitMode(fitMode);
          this.viewMenu_.setMenuItemSelected('menu-view-fit-best', fitMode === FitMode.Best);
          this.viewMenu_.setMenuItemSelected('menu-view-fit-height', fitMode === FitMode.Height);
          this.viewMenu_.setMenuItemSelected('menu-view-fit-width', fitMode === FitMode.Width);
          break;
      }
    }, MenuEventType.ITEM_SELECTED);

    this.mainMenu_.subscribe(this, evt => getElem('main-menu-button').focus(), MenuEventType.CLOSE);
    this.mainMenu_.subscribe(this, evt => {
      switch (evt.item.id) {
        case 'menu-close-all': this.closeAll_(); break;
        case 'menu-help': this.toggleHelpOpen_(); break;
      }
    }, MenuEventType.ITEM_SELECTED);

    const fileInput = getElem('menu-open-local-files-input');
    fileInput.addEventListener('change', (e) => this.loadLocalFiles_(e));

    getElem('main-menu-button').addEventListener('click', (e) => this.toggleMenuOpen_());

    getElem('readingStackButton').addEventListener('click', () => this.toggleReadingStackOpen_());
    getElem('readingStackOverlay').addEventListener('click', (e) => {
      this.toggleReadingStackOpen_();
    });
  }

  /** @private */
  initDragDrop_() {
    const swallowEvent = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('dragenter', swallowEvent);
    document.addEventListener('dragexit', swallowEvent);
    document.addEventListener('dragover', swallowEvent);
    document.addEventListener('drop', (e) => {
      swallowEvent(e);
      this.loadLocalFiles_({target: e.dataTransfer});
    });
  }

  /** @private */
  initClickHandlers_() {
    // TODO: Move this click handler into BookViewer?
    const bookViewerElem = getElem(BOOK_VIEWER_ELEM_ID);
    const firstPageElem = getElem('page1');
    bookViewerElem.addEventListener('click', (evt) => {
      if (this.readingStack_.isOpen()) {
        this.toggleReadingStackOpen_();
        return;
      }

      // Two-page viewer mode is simpler to figure out what the click means.
      if (this.bookViewer_.getNumPagesInViewer() === 2) {
        const targetId = evt.target.id;
        if (targetId === 'page1Image' || targetId === 'page1Html') {
          this.showPrevPage();
        } else if (targetId === 'page2Image' || targetId === 'page2Html') {
          this.showNextPage();
        }
        return;
      }

      // Calculate where the user clicked in the image.
      const mainContentBbox = firstPageElem.getBoundingClientRect();
      const bookWidth = mainContentBbox.width;
      const bookHeight = mainContentBbox.height;
      const clickX = evt.clientX - mainContentBbox.left;
      const clickY = evt.clientY - mainContentBbox.top;

      // Determine if the user clicked/tapped the left side or the
      // right side of the page.
      let clickedPrev = false;
      switch (this.bookViewer_.getRotateTimes()) {
        case 0: clickedPrev = clickX < (bookWidth / 2); break;
        case 1: clickedPrev = clickY < (bookHeight / 2); break;
        case 2: clickedPrev = clickX > (bookWidth / 2); break;
        case 3: clickedPrev = clickY > (bookHeight / 2); break;
      }
      if (clickedPrev) {
        this.showPrevPage();
      } else {
        this.showNextPage();
      }
    });
  }

  /** @private */
  initNav_() {
    getElem('prevBook').addEventListener('click', () => this.readingStack_.changeToPrevBook());
    getElem('prev').addEventListener('click', () => this.showPrevPage());
    getElem('next').addEventListener('click', () => this.showNextPage());
    getElem('nextBook').addEventListener('click', () => this.readingStack_.changeToNextBook());

    if (document.fullscreenEnabled) {
      const fsButton = getElem('fullScreen');
      fsButton.style.display = '';
      fsButton.addEventListener('click', () => this.toggleFullscreen_());
      document.addEventListener('fullscreenchange', () => this.bookViewer_.updateLayout());
    }
  }

  /** @private */
  initResizeHandler_() {
    window.addEventListener('resize', () => this.bookViewer_.updateLayout());
  }

  /** @private */
  initUnloadHandler_() {
    window.addEventListener('beforeunload', (event) => {
      if (this.readingStack_.getNumberOfBooks() > 0) {
        // Cancel the event as stated by the standard.
        event.preventDefault();
        // Chrome requires returnValue to be set.
        event.returnValue = '';
      }
    });
  }

  /** @private */
  initWheelScroll_() {
    window.addEventListener('wheel', (evt) => {
      let target = evt.target;
      while (target && target != window) {
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

  /**
   * @return {boolean}
   * @private
   */
  isHelpOpened_() {
    return getElem('helpOverlay').classList.contains('opened');
  }

  /** @private */
  async parseParams_() {
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
        // TODO: Support loading a reading list file here.
        // TODO: Try fetch first?
        this.loadSingleBookFromXHR(bookUri /* name */, bookUri /* url */, -1);
      }
    } else {
      // TODO: Eventually get rid of this and just rely on the query params.
      const hashcontent = window.location.hash.substr(1);
      if (hashcontent.lastIndexOf('ipfs', 0) === 0) {
        alert('Do not use the ipfs hash anymore, use the bookUri query parameter!')
        const ipfshash = hashcontent.substr(4);
        kthoom.ipfs.loadHash(ipfshash);
      }
    }

    const readingListUri = Params['readingListUri'];
    if (readingListUri) {
      try {
        const readingList = await this.tryLoadAndParseReadingListFromUrl_(readingListUri);
        this.loadBooksFromReadingList_(readingList);
        return;
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** @private */
  loadSettings_() {
    try {
      if (localStorage[LOCAL_STORAGE_KEY].length < 10) return;
      const s = JSON.parse(localStorage[LOCAL_STORAGE_KEY]);
      this.bookViewer_.setRotateTimes(s.rotateTimes);
      // Obsolete settings:  hflip. vflip.

      const fitMode = s.fitMode;
      if (fitMode) {
        this.viewMenu_.setMenuItemSelected('menu-view-fit-best', fitMode === FitMode.Best);
        this.viewMenu_.setMenuItemSelected('menu-view-fit-height', fitMode === FitMode.Height);
        this.viewMenu_.setMenuItemSelected('menu-view-fit-width', fitMode === FitMode.Width);
        
        // We used to store the key code for the mode... check for stale settings.
        switch (fitMode) {
          case Key.B: s.fitMode = FitMode.Best; break;
          case Key.H: s.fitMode = FitMode.Height; break;
          case Key.W: s.fitMode = FitMode.Width; break;
        }
        this.bookViewer_.setFitMode(s.fitMode);
      }

      if (s.numPagesInViewer) {
        this.bookViewer_.setNumPagesInViewer(s.numPagesInViewer);
        if (s.numPagesInViewer === 1) {
          this.viewMenu_.setMenuItemSelected('menu-view-one-page', true);
          this.viewMenu_.setMenuItemSelected('menu-view-two-page', false);
        } else {
          this.viewMenu_.setMenuItemSelected('menu-view-one-page', false);
          this.viewMenu_.setMenuItemSelected('menu-view-two-page', true);
        }
      }
    } catch(err) {}
  }

  /** @private */
  keyHandler_(evt) {
    const code = evt.keyCode;

    // If the overlay is shown, the only keystroke we handle is closing it.
    if (this.isHelpOpened_()) {
      this.toggleHelpOpen_();
      return;
    }

    let isMenuOpen = this.mainMenu_.isOpen() ;
    let isReadingStackOpen = this.readingStack_.isOpen();

    if (isMenuOpen) {
      // If the menu handled the key, then we are done.
      if (this.mainMenu_.handleKeyEvent(evt)) {
        return;
      }
    }

    // Handle keystrokes that do not depend on whether a book is loaded.
    switch (code) {
      case Key.O: getElem('menu-open-local-files-input').click(); break;
      case Key.U: this.loadFileViaUrl_(); break;
      case Key.F: this.toggleFullscreen_(); break;
      case Key.G: kthoom.google.doDrive(); break;
      case Key.I: kthoom.ipfs.ipfsHashWindow(); break;
      case Key.QUESTION_MARK: this.toggleHelpOpen_(); break;
      case Key.M:
        if (!isMenuOpen) {
          this.mainMenu_.open();
        }
        break;
      case Key.ESCAPE:
        if (isReadingStackOpen) {
          this.toggleReadingStackOpen_();
          isReadingStackOpen = false;
        }
        break;
      case Key.UP:
        if (isReadingStackOpen) {
          this.readingStack_.changeToPrevBook();
          return;
        }
        break;
      case Key.DOWN:
        if (isReadingStackOpen) {
          this.readingStack_.changeToNextBook();
          return;
        }
        break;
      case Key.S:
        if (!isMenuOpen) {
          this.toggleReadingStackOpen_();
          return;
        }
        break;
    }

    // All other key strokes below this are only valid if the menu and reading stack are closed.
    if (isReadingStackOpen) {
      this.toggleReadingStackOpen_();
      return;
    }

    if (evt.ctrlKey || evt.metaKey) return;

    if (getComputedStyle(getElem('progress')).display == 'none') return;

    let canKeyNext = ((document.body.offsetWidth+document.body.scrollLeft) / document.body.scrollWidth) >= 1;
    let canKeyPrev = (window.scrollX <= 0);

    switch (code) {
      case Key.LEFT:
        if (canKeyPrev) {
          if (evt.shiftKey) {
            this.bookViewer_.showPage(0);
          } else {
            this.showPrevPage();
          }
        }
        break;
      case Key.RIGHT:
        if (canKeyNext) {
          if (evt.shiftKey) {
            this.bookViewer_.showPage(this.currentBook_.getNumberOfPages() - 1);
          } else {
            this.showNextPage();
          }
        }
        break;
      case Key.UP:
        evt.preventDefault();
        evt.stopPropagation();
        window.scrollBy(0, -5);
        break;
      case Key.DOWN:
        evt.preventDefault();
        evt.stopPropagation();
        window.scrollBy(0, 5);
        break;
      case Key.LEFT_SQUARE_BRACKET:
        this.readingStack_.changeToPrevBook();
        break;
      case Key.RIGHT_SQUARE_BRACKET:
        this.readingStack_.changeToNextBook();
        break;
      case Key.L:
        this.bookViewer_.rotateCounterClockwise();
        this.saveSettings_();
      break;
      case Key.R:
        this.bookViewer_.rotateClockwise();
        this.saveSettings_();
        break;
      case Key.W: case Key.H: case Key.B:
        const fitMode =
            code === Key.W ? FitMode.Width :
            code === Key.H ? FitMode.Height :
            code === Key.B ? FitMode.Best : undefined;
        this.bookViewer_.setFitMode(fitMode);
        this.viewMenu_.setMenuItemSelected('menu-view-fit-best', fitMode === FitMode.Best);
        this.viewMenu_.setMenuItemSelected('menu-view-fit-height', fitMode === FitMode.Height);
        this.viewMenu_.setMenuItemSelected('menu-view-fit-width', fitMode === FitMode.Width);
        this.saveSettings_();
        break;
      case Key.NUM_1: case Key.NUM_2:
        const numPages = code - Key.NUM_1 + 1;
        this.bookViewer_.setNumPagesInViewer(numPages);
        if (numPages === 1) {
          this.viewMenu_.setMenuItemSelected('menu-view-one-page', true);
          this.viewMenu_.setMenuItemSelected('menu-view-two-page', false);
        } else {
          this.viewMenu_.setMenuItemSelected('menu-view-one-page', false);
          this.viewMenu_.setMenuItemSelected('menu-view-two-page', true);
        }
        this.saveSettings_();
        break;
      default:
        break;
    }
  }

  /** @private */
  saveSettings_() {
    localStorage[LOCAL_STORAGE_KEY] = JSON.stringify({
      rotateTimes: this.bookViewer_.getRotateTimes(),
      fitMode: this.bookViewer_.getFitMode(),
      numPagesInViewer: this.bookViewer_.getNumPagesInViewer(),
    });
  }

  updateProgressMeter(label) {
    this.bookViewer_.updateProgressMeter(label);
  }

  /**
   * Attempts to load a ReadingList from a given URL.
   * TODO: Move this to a separate module for processing JSON Reading Lists?
   * @param {string} url The URL of the file.
   * @returns {Promise<Array<Object>} A Promise that returns with the list of books or rejects
   *     with an error string.
   */
  tryLoadAndParseReadingListFromUrl_(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.onload = (evt) => {
        resolve(this.loadAndParseReadingList_(evt.target.response));
      };
      xhr.onerror = (err) => {
        console.error(err);
        reject(err);
      }
      xhr.send(null);
    });
  }

  /** @private */
  toggleFullscreen_() {
    if (document.fullscreenEnabled) {
      const fsPromise = document.fullscreenElement ?
          document.exitFullscreen() :
          document.documentElement.requestFullscreen();
      fsPromise.then(() => this.bookViewer_.updateLayout());
    }
  }

  /** @private */
  toggleHelpOpen_() {
    getElem('helpOverlay').classList.toggle('opened');
  }

  /** @private */
  toggleMenuOpen_() {
    if (!this.mainMenu_.isOpen()) {
      getElem('main-menu-button').setAttribute('aria-expanded', 'true');
      this.mainMenu_.open();
    } else {
      getElem('main-menu-button').setAttribute('aria-expanded', 'false');
      this.mainMenu_.close();
    }
  }

  /** @private */
  toggleReadingStackOpen_() {
    this.readingStack_.toggleReadingStackOpen();
    if (this.readingStack_.isOpen()) {
      getElem('readingStackOverlay').removeAttribute('style');
    } else {
      getElem('readingStackOverlay').setAttribute('style', 'display:none');
    }
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
   * Finds a more readable display name for a book from a JSON Reading List.
   * TODO: Move this to a separate module for processing JSON Reading Lists?
   * @param {Object} item An item object from the JSON Reading List format.
   * @return {string}
   */
  getNameForBook_(item) {
    return item.name || item.uri.split('/').pop().split('.').slice(0, -1).join('.') || item.uri;
  }

  /**
   * Loads books into the reading stack, in serial.
   * @param {Array<Promise<Book>} bookPromises A list of promises, each of which will resolve to a
   *     book or error.
   */
  async loadBooksFromPromises_(bookPromises) {
    const books = [];
    let foundError = false;
    for (const bookPromise of bookPromises) {
      try {
        const book = await bookPromise;
        books.push(book);
      } catch (err) {
        foundError = true;
      }
    }

    if (foundError) {
      alert('Could not open all books. See the console for more info.');
    }
  }

  /**
   * Attempts to read the files that the user has chosen.
   * @private
   */
  async loadLocalFiles_(evt) {
    const filelist = evt.target.files;
    if (filelist.length <= 0) {
      return;
    }

    for (let fileNum = 0; fileNum < filelist.length; ++fileNum) {
      const theFile = filelist[fileNum];
      // First, try to load the file as a JSON Reading List.
      if (theFile.name.toLowerCase().endsWith('.jrl')) {
        try {
          const readingList = await this.loadAndParseReadingList_(theFile);
          this.loadBooksFromReadingList_(readingList);
          continue;
        } catch {}
      }

      // Else, assume the file is a single book and try to load it.
      const singleBook = new Book(theFile.name)
      this.loadBooksFromPromises_([singleBook.loadFromFile(theFile)]);
      this.readingStack_.addBook(singleBook);
    }
  }

  /**
   * Asks the user for a URL to load and then loads it.
   */
  async loadFileViaUrl_() {
    const bookUrl = window.prompt('Enter the URL of the book to load');
    if (bookUrl) {
      if (bookUrl.toLowerCase().endsWith('.jrl')) {
        try {
          const readingList = await this.tryLoadAndParseReadingListFromUrl_(bookUrl);
          this.loadBooksFromReadingList_(readingList);
          return;
        } catch (err) {
          console.error(err);
        }
      }

      this.loadSingleBookFromXHR(bookUrl /* name */, bookUrl /* url */, -1);
    }
  }

  /**
   * Closes all open files.
   */
  closeAll_() {
    if (this.readingStack_.getNumberOfBooks() > 0) {
      this.readingStack_.removeAll();

      this.bookViewer_.closeBook();
      this.currentBook_ = null;
      getElem('background').setAttribute('style', 'background-image: url("images/logo.svg")');
      this.mainMenu_.showMenuItem('menu-close-all', false);
      for (const button of ['prevBook', 'prev', 'next', 'nextBook'].map(getElem)) {
        button.setAttribute('disabled', 'true');
      }
    }
  }

  /**
   * @param {string} name The book name.
   * @param {string} uri The URI to fetch.
   * @param {number} expectedSize Unarchived size in bytes.  If -1, then the
   *     data from the XHR progress events is used.
   * @param {Object<string, string>} headerMap A map of request header keys and values.
   * @return {Promise<Book>}
   */
  loadSingleBookFromXHR(name, uri, expectedSize, headerMap = {}) {
    const book = new Book(name, uri);
    const bookPromise = book.loadFromXhr(expectedSize, headerMap);
    this.readingStack_.addBook(book);
    return bookPromise;
  }

  /**
   * @param {string} name The book name.
   * @param {string} uri The resource to fetch.
   * @param {Object} init An object to initialize the Fetch API.
   * @param {number} expectedSize Unarchived size in bytes.
   * @return {Promise<Book>}
   */
  loadSingleBookFromFetch(name, uri, init, expectedSize) {
    if (!window['fetch'] || !window['Response'] || !window['ReadableStream']) {
      throw 'No browser support for fetch/ReadableStream';
    }

    const book = new Book(name, uri);
    const bookPromise = book.loadFromFetch(init, expectedSize);
    this.readingStack_.addBook(book);
    return bookPromise;
  }

  /**
   * @param {string} name
   * @param {string} bookUri
   * @param {ArrayBuffer} ab
   * @return {Promise<Book>}
   */
  loadSingleBookFromArrayBuffer(name, bookUri, ab) {
    const book = new Book(name);
    const bookPromise = book.loadFromArrayBuffer(bookUri, ab)
    this.readingStack_.addBook(book);
    return bookPromise;
  }

  /**
   * Loads the Reading List from the JSON blob.  The blob must contain a JSON Reading List that
   * matches this minimum format:
   * {
   *   "items": [
   *     {"type": "book", "uri": "http://foo/bar"},
   *     ...
   *   ]
   * }
   * Each item may also contain an optional name field.  See jrl-schema.json for the full schema.
   * TODO: Move this to a separate module for processing JSON Reading Lists?
   * @param {Blob|File} jsonBlob The JSON blob/file.
   * @return {Promise<Array<Object>>} Returns a Promise that will resolve with an array of item
   *     objects (see format above), or rejects with an error string.
   * @private
   */
  loadAndParseReadingList_(jsonBlob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const jsonContents = JSON.parse(fr.result);
          if (!jsonContents.items || !Array.isArray(jsonContents.items) ||
              jsonContents.items.length === 0) {
            reject(null);
          } else {
            for (const item of jsonContents.items) {
              // Each item object must at least have a uri string field and be type=book.
              if (!(item instanceof Object) ||
                  !item.uri || !(typeof item.uri === 'string') ||
                  !item.type || item.type !== 'book') {
                console.error('Invalid item: ');
                console.dir(item);
                reject('Invalid item inside JSON Reading List file');
              }
            }
            resolve(jsonContents.items);
          }
        } catch (err) {
          reject('Invalid JSON Reading List file: ' + err);
        }
      };
      fr.onerror = () => reject(null);
      fr.readAsText(jsonBlob);
    });
  }

  /**
   * Adds all books in reading list to the stack and loads in each book in serial.
   * @param {Array<Object>} readingList An array of reading list items.
   * @private
   */
  async loadBooksFromReadingList_(readingList) {
    if (readingList && readingList.length > 0) {
      const books = readingList.map(item => new Book(this.getNameForBook_(item), item.uri));
      // Add all books to the stack immediately.
      this.readingStack_.addBooks(books, true /* switchToFirst */);

      // Load the first book.  The remaining books will be loaded from the ReadingStack when the
      // user chooses a different book.
      const firstBook = books.shift();
      await firstBook.loadFromXhr();
    }
  }

  /**
   * @param {Book} book
   * @private
   */
  handleCurrentBookChanged_(book) {
    if (book !== this.currentBook_) {
      this.bookViewer_.closeBook();

      // hide logo
      getElem('background').setAttribute('style', 'display:none');

      this.currentBook_ = book;
      this.bookViewer_.setCurrentBook(book);
      document.title = book.getName();
      for (const button of ['prevBook', 'prev', 'next', 'nextBook'].map(getElem)) {
        button.removeAttribute('disabled');
      }
    }
    // Show the Close All menu item.
    this.mainMenu_.showMenuItem('menu-close-all', true);
  }
}

const theApp = new KthoomApp();
if (!window.kthoom.getApp) {
  window.kthoom.getApp = () => theApp;
}
