/*
 * kthoom.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2011 Google Inc.
 * Copyright(c) 2011 antimatter15
 */

if (window.kthoom == undefined) {
  window.kthoom = {};
}

const SWIPE_THRESHOLD = 50; // TODO: Tweak this?
const LOCAL_STORAGE_KEY = 'kthoom_settings';

// key codes
const Key = {
    ESCAPE: 27,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40, 
    A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73, J: 74, K: 75, L: 76, M: 77, 
    N: 78, O: 79, P: 80, Q: 81, R: 82, S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90,
    QUESTION_MARK: 191,
    LEFT_SQUARE_BRACKET: 219,
    RIGHT_SQUARE_BRACKET: 221,
};

// Helper functions.
function getElem(id) {
  return document.body.querySelector('#' + id);
}

function createURLFromArray(array, mimeType) {
  const offset = array.byteOffset;
  const len = array.byteLength;
  let blob = new Blob([array], {type: mimeType}).slice(offset, offset + len, mimeType);
  return URL.createObjectURL(blob);
}

// global variables
const library = {
  allBooks: [],
  currentBookNum: 0,
};
  
// Stores an image filename and its data: URI.
class ImageFile {
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

/**
 * The main class for the kthoom reader.
 */
class KthoomApp {
  constructor() {
    this.unarchiver_ = null;
    this.currentImage_ = 0;
    this.imageFiles_ = [];
    this.imageFilenames_ = [];
    this.totalImages_ = 0;
    this.lastCompletion_ = 0;

    this.rotateTimes_ = 0;
    this.hflip_ = false;
    this.vflip_ = false;
    this.fitMode_ = Key.B;

    this.wheelTimer_ = null;
    this.wheelTurnedPageAt_ = 0;

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
    this.initProgressMeter_();
    this.initMenu_();
    this.initDragDrop_();
    this.initSwipe_();
    this.initClickHandlers_();
    this.initResizeHandler_();

    document.addEventListener('keydown', (e) => this.keyHandler_(e), false);

    this.loadSettings_();
    this.loadHash_();

    console.log('kthoom initialized');
  }

  /** @private */
  initProgressMeter_() {
    const pdiv = getElem('progress');
    const svg = getElem('svgprogress');
    svg.onclick = (e) => {
      let l = 0;
      const docEl = document.documentElement;
      for (let x = pdiv; x != docEl; x = x.parentNode) {
        l += x.offsetLeft;
      }
      const page = Math.max(1, Math.ceil(((e.clientX - l)/pdiv.offsetWidth) * this.totalImages_)) - 1;
      this.currentImage_ = page;
      this.updatePage();
    };
  }

  /** @private */
  initMenu_() {
    getElem('menu').addEventListener('click', (e) => e.currentTarget.classList.toggle('opened'));
    getElem('menu-open-local-files').addEventListener('change', (e) => this.getLocalFiles(e), false);
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
      this.getLocalFiles({target: e.dataTransfer});
    }, false);
  }

  /** @private */
  initSwipe_() {
    window.addEventListener('wheel', (evt) => {
      evt.preventDefault();

      // Keep the timer going if it has been started.
      if (this.wheelTimer_) {
        clearTimeout(this.wheelTimer_);
      }
      // If we haven't received wheel events for some time, reset things.
      this.wheelTimer_ = setTimeout(() => {
        this.wheelTimer_ = null;
        this.wheelTurnedPageAt_ = 0;
      }, 200);

      // Determine what delta is relevant based on orientation.
      const delta = (this.rotateTimes_ %2 == 0 ? evt.deltaX : evt.deltaY);

      // If we turned the page, we won't let the page turn again until the delta
      // is below the hysteresis threshold (i.e. the swipe has lost its momentum).
      if (this.wheelTurnedPageAt_ !== 0) {
        if (Math.abs(delta) < SWIPE_THRESHOLD / 3) {
          this.wheelTurnedPageAt_ = 0;
        }
      } else {
        // If we haven't turned the page yet, see if this delta would turn the page.
        let turnPageFn = null;
        if (this.rotateTimes_ <= 1) {
          if (delta > SWIPE_THRESHOLD) turnPageFn = () => this.showNextPage();
          else if (delta < -SWIPE_THRESHOLD) turnPageFn = () => this.showPrevPage();
        } else if (this.rotateTimes_ <= 3) {
          if (delta < -SWIPE_THRESHOLD) turnPageFn = () => this.showNextPage();
          else if (delta > SWIPE_THRESHOLD) turnPageFn = () => this.showPrevPage();
        }
        if (turnPageFn) {
          turnPageFn();
          this.wheelTurnedPageAt_ = delta;
        }
      }
    }, true);
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
      switch (this.rotateTimes_) {
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

    getElem('libraryTab').addEventListener('click', () => this.toggleLibraryOpen(), false);

    // Toolbar
    getElem('prevBook').addEventListener('click', () => this.loadPrevBook(), false);
    getElem('prev').addEventListener('click', () => this.showPrevPage(), false);
    getElem('toolbarbutton').addEventListener('click', () => this.toggleToolbar(), false);
    getElem('next').addEventListener('click', () => this.showNextPage(), false);
    getElem('nextBook').addEventListener('click', () => this.loadNextBook(), false);
  }

  /** @private */
  initResizeHandler_() {
    window.addEventListener('resize', () => {
      const f = (screen.width - innerWidth < 4 && screen.height - innerHeight < 4);
      getElem('header').className = f ? 'fullscreen' : '';
      this.updateScale();
    }, false);
  }

  loadHash_() {
    const hashcontent = window.location.hash.substr(1);
    if (hashcontent.lastIndexOf("ipfs", 0) === 0) {
      const ipfshash = hashcontent.substr(4);
      kthoom.ipfs.loadHash(ipfshash);
    }
  }

  /** @private */
  loadSettings_() {
    try {
      if (localStorage[LOCAL_STORAGE_KEY].length < 10) return;
      const s = JSON.parse(localStorage[LOCAL_STORAGE_KEY]);
      this.rotateTimes_ = s.rotateTimes;
      this.hflip_ = s.hflip;
      this.vflip_ = s.vflip;
      this.fitMode_ = s.fitMode;
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
    } else if (code == Key.G) {
      kthoom.google.doDrive();
    } else if (code == Key.QUESTION_MARK) {
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
        if (library.currentBookNum > 0) {
          this.loadPrevBook();
        }
        break;
      case Key.RIGHT_SQUARE_BRACKET:
        if (library.currentBookNum < library.allBooks.length - 1) {
          this.loadNextBook();
        }
        break;
      case Key.L:
      this.rotateTimes_--;
        if (this.rotateTimes_ < 0) {
          this.rotateTimes_ = 3;
        }
        this.updatePage();
        break;
      case Key.R:
      this.rotateTimes_++;
        if (this.rotateTimes_ > 3) {
          this.rotateTimes_ = 0;
        }
        this.updatePage();
        break;
      case Key.F:
        if (!this.hflip_ && !this.vflip_) {
          this.hflip_ = true;
        } else if(this.hflip_ == true) {
          this.vflip_ = true;
          this.hflip_ = false;
        } else if(this.vflip_ == true) {
          this.vflip_ = false;
        }
        this.updatePage();
        break;
      case Key.W: case Key.H: case Key.B: case Key.N:
        this.fitMode_ = code;
        this.updateScale();
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

  // TODO: Make this private.
  updateScale(clear = false) {
    const mainImageStyle = getElem('mainImage').style;
    mainImageStyle.width = '';
    mainImageStyle.height = '';
    mainImageStyle.maxWidth = '';
    mainImageStyle.maxHeight = '';
    let maxheight = innerHeight - 15;
    if (!/fullscreen/.test(getElem('header').className)) {
      maxheight -= 25;
    }
    if (clear || this.fitMode_ == Key.N) {
    } else if (this.fitMode_ == Key.B) {
      mainImageStyle.maxWidth = '100%';
      mainImageStyle.maxHeight = maxheight + 'px';
    } else if (this.fitMode_ == Key.H) {
      mainImageStyle.height = maxheight + 'px';
    } else if (this.fitMode_ == Key.W) {
      mainImageStyle.width = '100%';
    }
    this.saveSettings();
  }

  initialized() { return this.initializedPromise_; }

  saveSettings() {
    localStorage[LOCAL_STORAGE_KEY] = JSON.stringify({
      rotateTimes: this.rotateTimes_,
      hflip: this.hflip_,
      vflip: this.vflip_,
      fitMode: this.fitMode_,
    });
  }

  setProgressMeter(pct, opt_label) {
    pct = (pct*100);
    if (isNaN(pct)) pct = 1;
    const part = 1 / this.totalImages_;
    const remain = ((pct - this.lastCompletion_)/100)/part;
    const fract = Math.min(1, remain);
    let smartpct = ((this.imageFiles_.length / this.totalImages_) + fract * part )* 100;
    if (this.totalImages_ == 0) smartpct = pct;

    let oldval = parseFloat(getElem('meter').getAttribute('width'));
    if (isNaN(oldval)) oldval = 0;
    const weight = 0.5;
    smartpct = (weight * smartpct + (1-weight) * oldval);
    if (pct == 100) smartpct = 100;

    if (!isNaN(smartpct)) {
      getElem('meter').setAttribute('width', smartpct + '%');
    }

    let title = getElem('progress_title');
    while (title.firstChild) title.removeChild(title.firstChild);

    let labelText = pct.toFixed(2) + '% ' + this.imageFiles_.length + '/' + this.totalImages_ + '';
    if (opt_label) {
      labelText = opt_label + ' ' + labelText;
    }
    title.appendChild(document.createTextNode(labelText));

    getElem('meter2').setAttribute('width',
        100 * (this.totalImages_ == 0 ? 0 : ((this.currentImage_ + 1) / this.totalImages_)) + '%');

    title = getElem('page');
    while (title.firstChild) title.removeChild(title.firstChild);
    title.appendChild(document.createTextNode((this.currentImage_ + 1) + '/' + this.totalImages_));

    if (pct > 0) {
      getElem('nav').className = '';
      getElem('progress').className = '';
    }
  }

  toggleLibraryOpen() {
    getElem('library').classList.toggle('opened');
  }

  showLibrary(show) {
    getElem('library').style.visibility = (show ? 'visible' : 'hidden');
  }

  toggleToolbar() {
    getElem('header').classList.toggle('fullscreen');
    this.updateScale();
  }

  // TODO: Use timer ids here to prevent cancelling an earlier operation.
  showHeaderPreview() {
    const header = getElem('header');
    if (header.classList.contains('fullscreen')) {
      header.classList.remove('previewout');
      header.classList.add('preview');
      setTimeout(() => {
        header.classList.add('previewout');
        setTimeout(() => {
          header.classList.remove('preview', 'previewout');
        }, 1000);
      }, 1337);
    }
  }

  showPrevPage() {
    this.currentImage_--;

    if (this.currentImage_ < 0) {
      if (library.allBooks.length == 1) {
        this.currentImage_ = this.imageFiles_.length - 1;
      } else if (library.currentBookNum > 0) {
        this.loadPrevBook();
      } else {
        // Freeze on the current page.
        this.currentImage_++;
        return;
      }
    }

    this.updatePage();
    this.showHeaderPreview();
  }

  showNextPage() {
    this.currentImage_++;

    if (this.currentImage_ >= Math.max(this.totalImages_, this.imageFiles_.length)) {
      if (library.allBooks.length == 1) {
        this.currentImage_ = 0;
      } else if (library.currentBookNum < library.allBooks.length - 1) {
        this.loadNextBook();
      } else {
        // Freeze on the current page.
        this.currentImage_--;
        return;
      }
    }

    this.updatePage();
    this.showHeaderPreview();
  }

  loadPrevBook() {
    if (library.currentBookNum > 0) {
      this.loadBook(library.currentBookNum - 1);
    }
  }

  loadNextBook() {
    if (library.currentBookNum < library.allBooks.length - 1) {
      this.loadBook(library.currentBookNum + 1);
    }
  }

  loadBook(bookNum) {
    if (bookNum >= 0 && bookNum < library.allBooks.length) {
      this.closeBook();
      library.currentBookNum = bookNum;
      this.loadSingleBook(library.allBooks[library.currentBookNum]);
      this.updateLibrary();
    }
  }

  /**
   * @param {File} file
   */
  loadSingleBook(file) {
    const fr = new FileReader();
    fr.onload = () => this.loadFromArrayBuffer(fr.result);
    fr.readAsArrayBuffer(file);
  }

  closeBook() {
    // Terminate any async work the current unarchiver is doing.
    if (this.unarchiver_) {
      this.unarchiver_.stop();
      this.unarchiver_ = null;
    }
    this.currentImage_ = 0;
    this.imageFiles_ = [];
    this.imageFilenames_ = [];
    this.totalImages_ = 0;
    this.lastCompletion_ = 0;

    // display logo
    getElem('logo').setAttribute('style', 'display:block');
    getElem('nav').className = 'hide';
    getElem('progress').className = 'hide';
    getElem('meter').setAttribute('width', '0%');

    this.setProgressMeter(0);
    this.updatePage();
  }

  updatePage() {
    const title = getElem('page');
    while (title.firstChild) title.removeChild(title.firstChild);
    title.appendChild(document.createTextNode( (this.currentImage_ + 1) + '/' + this.totalImages_ ));

    getElem('meter2').setAttribute('width',
        100 * (this.totalImages_ == 0 ? 0 : ((this.currentImage_ + 1) / this.totalImages_)) + '%');
    if (this.imageFiles_[this.currentImage_]) {
      this.setImage(this.imageFiles_[this.currentImage_].dataURI);
    } else {
      this.setImage('loading');
    }
  }

  // Fills the library with the book names.
  updateLibrary() {
    const libDiv = getElem('libraryContents');
    // Clear out the library.
    libDiv.innerHTML = '';
    if (library.allBooks.length > 0) {
      for (let i = 0; i < library.allBooks.length; ++i) {
        const book = library.allBooks[i];
        const bookDiv = document.createElement('div');
        bookDiv.classList.add('libraryBook');
        if (library.currentBookNum == i) {
          bookDiv.classList.add('current');
        }
        bookDiv.dataset.index = i;
        bookDiv.innerHTML = book.name;
        bookDiv.addEventListener('click', (evt) => {
          // Trigger a re-render of the library.
          const index = parseInt(evt.target.dataset.index, 10);
          this.loadBook(index);
        });
        libDiv.appendChild(bookDiv);
      }
    }
  }

  // Attempts to read the files that the user has chosen.
  getLocalFiles(evt) {
    const filelist = evt.target.files;
    library.allBooks = filelist;
    library.currentBookNum = 0;

    this.closeBook();
    this.loadSingleBook(filelist[0]);

    // Only show library if we have more than one book.
    if (filelist.length > 1) {
      this.showLibrary(true);
      this.updateLibrary();
    }
  }

  loadFromArrayBuffer(ab) {
    const start = (new Date).getTime();
    const h = new Uint8Array(ab, 0, 10);
    const pathToBitJS = 'code/bitjs/';
    if (h[0] == 0x52 && h[1] == 0x61 && h[2] == 0x72 && h[3] == 0x21) { // Rar!
      this.unarchiver_ = new bitjs.archive.Unrarrer(ab, pathToBitJS);
    } else if (h[0] == 0x50 && h[1] == 0x4B) { // PK (Zip)
      this.unarchiver_ = new bitjs.archive.Unzipper(ab, pathToBitJS);
    } else if (h[0] == 255 && h[1] == 216) { // JPEG
      this.totalImages_ = 1;
      this.setProgressMeter(1, 'Archive Missing');
      const dataURI = createURLFromArray(new Uint8Array(ab), 'image/jpeg');
      this.setImage(dataURI);
      // hide logo
      getElem('logo').setAttribute('style', 'display:none');
      return;
    } else { // Try with tar
      this.unarchiver_ = new bitjs.archive.Untarrer(ab, pathToBitJS);
    }

    // Listen for UnarchiveEvents.
    if (this.unarchiver_) {
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.PROGRESS, (e) => {
          const percentage = e.currentBytesUnarchived / e.totalUncompressedBytesInArchive;
          this.totalImages_ = e.totalFilesInArchive;
          this.setProgressMeter(percentage, 'Unzipping');
          // display nav
          this.lastCompletion_ = percentage * 100;
      });
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.INFO, (e) => console.log(e.msg));
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.EXTRACT, (e) => {
          // convert DecompressedFile into a bunch of ImageFiles
          if (e.unarchivedFile) {
            const f = e.unarchivedFile;
            // add any new pages based on the filename
            if (this.imageFilenames_.indexOf(f.filename) == -1) {
              this.imageFilenames_.push(f.filename);
              this.imageFiles_.push(new ImageFile(f));
            }
          }

          // hide logo
          getElem('logo').setAttribute('style', 'display:none');

          // display first page if we haven't yet
          if (this.imageFiles_.length == this.currentImage_ + 1) {
            this.updatePage();
          }
      });
      this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.FINISH, (e) => {
          const diff = ((new Date).getTime() - start)/1000;
          console.log('Unarchiving done in ' + diff + 's');
      });
      this.unarchiver_.start();
    } else {
      alert('Some error');
    }
  }

  setImage(url) {
    const canvas = getElem('mainImage');
    const prevImage = getElem('prevImage');
    const x = canvas.getContext('2d');
    getElem('mainText').style.display = 'none';
    if (url == 'loading') {
      this.updateScale(true);
      canvas.width = innerWidth - 100;
      canvas.height = 200;
      x.fillStyle = 'red';
      x.font = '50px sans-serif';
      x.strokeStyle = 'black';
      x.fillText('Loading Page #' + (this.currentImage_ + 1), 100, 100)
    } else {
      if (document.body.scrollHeight/innerHeight > 1) {
        document.body.style.overflowY = 'scroll';
      }

      const img = new Image();
      img.onerror = (e) => {
        canvas.width = innerWidth - 100;
        canvas.height = 300;
        this.updateScale(true);
        x.fillStyle = 'orange';
        x.font = '32px sans-serif';
        x.strokeStyle = 'black';
        x.fillText('Page #' + (this.currentImage_ + 1) + ' (' +
            this.imageFiles_[this.currentImage_].filename + ')', 100, 100)

        if (/(html|htm)$/.test(this.imageFiles_[this.currentImage_].filename)) {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onload = () => {
            getElem('mainText').style.display = '';
            getElem('mainText').innerHTML = '<iframe style="width:100%;height:700px;border:0" src="data:text/html,'+escape(xhr.responseText)+'"></iframe>';
          }
          xhr.send(null);
        } else if (!/(jpg|jpeg|png|gif)$/.test(this.imageFiles_[this.currentImage_].filename)) {
          const fileSize = (this.imageFiles_[this.currentImage_].data.fileData.length);
          if (fileSize < 10*1024) {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.onload = () => {
              getElem('mainText').style.display = '';
              getElem('mainText').innerText = xhr.responseText;
            };
            xhr.send(null);
          } else {
            x.fillText('Cannot display this type of file', 100, 200);
          }
        }
      };
      img.onload = () => {
        const h = img.height;
        const w = img.width;
        let sw = w;
        let sh = h;
        this.rotateTimes_ = (4 + this.rotateTimes_) % 4;
        x.save();
        if (this.rotateTimes_ % 2 == 1) { sh = w; sw = h;}
        canvas.height = sh;
        canvas.width = sw;
        x.translate(sw/2, sh/2);
        x.rotate(Math.PI/2 * this.rotateTimes_);
        x.translate(-w/2, -h/2);
        if (this.vflip_) {
          x.scale(1, -1)
          x.translate(0, -h);
        }
        if (this.hflip_) {
          x.scale(-1, 1)
          x.translate(-w, 0);
        }
        canvas.style.display = 'none';
        scrollTo(0,0);
        x.drawImage(img, 0, 0);

        this.updateScale();

        canvas.style.display = '';
        document.body.style.overflowY = '';
        x.restore();
      };
      if (img.src) {
        prevImage.setAttribute('src', img.src);
      }
      img.src = url;
    };
  }
}

const theApp = new KthoomApp();

if (!window.kthoom.getApp) {
  window.kthoom.getApp = () => theApp;
}
