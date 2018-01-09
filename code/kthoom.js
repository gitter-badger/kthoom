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
  if (document.documentElement.querySelector) {
    // querySelector lookup
    return document.body.querySelector('#' + id);
  }
  // getElementById lookup
  return document.getElementById(id);
}

function createURLFromArray(array, mimeType) {
  const offset = array.byteOffset;
  const len = array.byteLength;
  let blob = new Blob([array], {type: mimeType}).slice(offset, offset + len, mimeType);
  return URL.createObjectURL(blob);
}

// The rotation orientation of the comic.
kthoom.rotateTimes = 0;

// global variables
let unarchiver = null;
let currentImage = 0;
let imageFiles = [];
let imageFilenames = [];
let totalImages = 0;
let lastCompletion = 0;
const library = {
  allBooks: [],
  currentBookNum: 0,
};
  
let hflip = false;
let vflip = false;
let fitMode = Key.B;
let canKeyNext = true;
let canKeyPrev = true;

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

// Attempts to read the files that the user has chosen.
function getLocalFiles(evt) {
  const filelist = evt.target.files;
  library.allBooks = filelist;
  library.currentBookNum = 0;

  closeBook();
  loadSingleBook(filelist[0]);

  // Only show library if we have more than one book.
  if (filelist.length > 1) {
    showLibrary(true);
    updateLibrary();
  }
}

/**
 * @param {File} file
 */
function loadSingleBook(file) {
  const fr = new FileReader();
  fr.onload = () => kthoom.getApp().loadFromArrayBuffer(fr.result);
  fr.readAsArrayBuffer(file);
}

function updatePage() {
  const title = getElem('page');
  while (title.firstChild) title.removeChild(title.firstChild);
  title.appendChild(document.createTextNode( (currentImage+1) + '/' + totalImages ));
  
  getElem('meter2').setAttribute('width',
      100 * (totalImages == 0 ? 0 : ((currentImage+1)/totalImages)) + '%');
  if (imageFiles[currentImage]) {
    setImage(imageFiles[currentImage].dataURI);
  } else {
    setImage('loading');
  }
}

function setImage(url) {
  const canvas = getElem('mainImage');
  const prevImage = getElem('prevImage');
  const x = canvas.getContext('2d');
  document.getElementById('mainText').style.display = 'none';
  if (url == 'loading') {
    updateScale(true);
    canvas.width = innerWidth - 100;
    canvas.height = 200;
    x.fillStyle = 'red';
    x.font = '50px sans-serif';
    x.strokeStyle = 'black';
    x.fillText('Loading Page #' + (currentImage + 1), 100, 100)
  } else {
    if (document.body.scrollHeight/innerHeight > 1) {
      document.body.style.overflowY = 'scroll';
    }
    
    const img = new Image();
    img.onerror = function(e) {
      canvas.width = innerWidth - 100;
      canvas.height = 300;
      updateScale(true);
      x.fillStyle = 'orange';
      x.font = '32px sans-serif';
      x.strokeStyle = 'black';
      x.fillText('Page #' + (currentImage+1) + ' (' +
          imageFiles[currentImage].filename + ')', 100, 100)
      
      if (/(html|htm)$/.test(imageFiles[currentImage].filename)) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onload = function() {
          document.getElementById('mainText').style.display = '';
          document.getElementById('mainText').innerHTML = '<iframe style="width:100%;height:700px;border:0" src="data:text/html,'+escape(xhr.responseText)+'"></iframe>';
        }
        xhr.send(null);
      } else if (!/(jpg|jpeg|png|gif)$/.test(imageFiles[currentImage].filename)) {
        const fileSize = (imageFiles[currentImage].data.fileData.length);
        if (fileSize < 10*1024) {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onload = function() {
            document.getElementById('mainText').style.display = '';
            document.getElementById('mainText').innerText = xhr.responseText;
          };
          xhr.send(null);
        } else {
          x.fillText('Cannot display this type of file', 100, 200);
        }
      }
    };
    img.onload = function() {
      const h = img.height; 
      const w = img.width;
      let sw = w;
      let sh = h;
      kthoom.rotateTimes = (4 + kthoom.rotateTimes) % 4;
      x.save();
      if (kthoom.rotateTimes % 2 == 1) { sh = w; sw = h;}
      canvas.height = sh;
      canvas.width = sw;
      x.translate(sw/2, sh/2);
      x.rotate(Math.PI/2 * kthoom.rotateTimes);
      x.translate(-w/2, -h/2);
      if (vflip) {
        x.scale(1, -1)
        x.translate(0, -h);
      }
      if (hflip) {
        x.scale(-1, 1)
        x.translate(-w, 0);
      }
      canvas.style.display = 'none';
      scrollTo(0,0);
      x.drawImage(img, 0, 0);
      
      updateScale();
        
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

function showPreview() {
  if (/fullscreen/.test(getElem('header').className)) {
    getElem('header').className += ' preview';
    setTimeout(() => {
      getElem('header').className += ' previewout';
      setTimeout(() => {
        getElem('header').className = getElem('header').className.replace(
            /previewout|preview/g, '');
      }, 1000);
    }, 1337);
  }
}

function loadBook(bookNum) {
  if (bookNum >= 0 && bookNum < library.allBooks.length) {
    closeBook();
    library.currentBookNum = bookNum;
    loadSingleBook(library.allBooks[library.currentBookNum]);
    updateLibrary();
  }
}

function loadPrevBook() {
  if (library.currentBookNum > 0) {
    loadBook(library.currentBookNum - 1);
  }
}
kthoom.loadPrevBook = loadPrevBook;

function loadNextBook() {
  if (library.currentBookNum < library.allBooks.length - 1) {
    loadBook(library.currentBookNum + 1);
  }
}
kthoom.loadNextBook = loadNextBook;

function showPrevPage() {
  currentImage--;

  if (currentImage < 0) {
    if (library.allBooks.length == 1) {
      currentImage = imageFiles.length - 1;
    } else if (library.currentBookNum > 0) {
      loadPrevBook();
    } else {
      // Freeze on the current page.
      currentImage++;
      return;
    }
  }

  updatePage();
  //showPreview();
  //getElem('prev').focus();
}
kthoom.showPrevPage = showPrevPage;

function showNextPage() {
  currentImage++;
  
  if (currentImage >= Math.max(totalImages, imageFiles.length)) {
    if (library.allBooks.length == 1) {
      currentImage = 0;
    } else if (library.currentBookNum < library.allBooks.length - 1) {
      loadNextBook();
    } else {
      // Freeze on the current page.
      currentImage--;
      return;
    }
  }

  updatePage();
  //showPreview();
  //getElem('next').focus();
}
kthoom.showNextPage = showNextPage;

function toggleToolbar() {
  const headerDiv = getElem('header');
  const fullscreen = /fullscreen/.test(headerDiv.className);
  headerDiv.className = (fullscreen ? '' : 'fullscreen');
  //getElem('toolbarbutton).innerText = s?'-':'+';
  updateScale();
}
kthoom.toggleToolbar = toggleToolbar;

// Shows/hides the library.
function showLibrary(show) {
  const libraryDiv = getElem('library');
  libraryDiv.style.visibility = (show ? 'visible' : 'hidden');
}

// Opens/closes the library.
function toggleLibraryOpen() {
  const libraryDiv = getElem('library');
  const opened = /opened/.test(libraryDiv.className);
  libraryDiv.className = (opened ? '' : 'opened');
}

// Fills the library with the book names.
function updateLibrary() {
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
        loadBook(index);
      });
      libDiv.appendChild(bookDiv);
    }
  }
}

function closeBook() {
  // Terminate any async work the current unarchiver is doing.
  if (unarchiver) {
    unarchiver.stop();
    unarchiver = null;
  }
  currentImage = 0;
  imageFiles = [];
  imageFilenames = [];
  totalImages = 0;
  lastCompletion = 0;
  
  // display logo
  getElem('logo').setAttribute('style', 'display:block');
  
  getElem('nav').className = 'hide';
  getElem('progress').className = 'hide';
  
  getElem('meter').setAttribute('width', '0%');
  
  kthoom.getApp().setProgressMeter(0);
  updatePage();
}

function updateScale(clear) {
  const mainImageStyle = getElem('mainImage').style;
  mainImageStyle.width = '';
  mainImageStyle.height = '';
  mainImageStyle.maxWidth = '';
  mainImageStyle.maxHeight = '';
  let maxheight = innerHeight - 15;
  if (!/fullscreen/.test(getElem('header').className)) {
    maxheight -= 25;
  }
  if (clear || fitMode == Key.N) {
  } else if (fitMode == Key.B) {
    mainImageStyle.maxWidth = '100%';
    mainImageStyle.maxHeight = maxheight + 'px';
  } else if (fitMode == Key.H) {
    mainImageStyle.height = maxheight + 'px';
  } else if (fitMode == Key.W) {
    mainImageStyle.width = '100%';
  }
  kthoom.getApp().saveSettings();
}

/**
 * @param {boolean} show Whether to show help.  Defaults to true.
 */
function showOrHideHelp(show = true) {
  getElem('overlay').style.display = show ? 'block' : 'none';
}

function keyHandler(evt) {
  const code = evt.keyCode;

  // If the overlay is shown, the only keystroke we handle is closing it.
  const overlayShown = getElem('overlay').style.display != 'none';
  if (overlayShown) {
    showOrHideHelp(false);
    return;
  }

  // Handle keystrokes that do not depend on whether a document is loaded.
  if (code == Key.O) {
    getElem('menu-open-local-files-input').click();
    getElem('menu').classList.remove('opened');
  } else if (code == Key.G) {
    kthoom.google.doDrive();
  } else if (code == Key.QUESTION_MARK) {
    showOrHideHelp(true);
  }

  if (getComputedStyle(getElem('progress')).display == 'none') return;
  canKeyNext = ((document.body.offsetWidth+document.body.scrollLeft) / document.body.scrollWidth) >= 1;
  canKeyPrev = (scrollX <= 0);

  if (evt.ctrlKey || evt.shiftKey || evt.metaKey) return;
  switch(code) {
    case Key.X:
      toggleToolbar();
      break;
    case Key.LEFT:
      if (canKeyPrev) showPrevPage();
      break;
    case Key.RIGHT:
      if (canKeyNext) showNextPage();
      break;
    case Key.LEFT_SQUARE_BRACKET:
      if (library.currentBookNum > 0) {
        loadPrevBook();
      }
      break;
    case Key.RIGHT_SQUARE_BRACKET:
      if (library.currentBookNum < library.allBooks.length - 1) {
        loadNextBook();
      }
      break;
    case Key.L:
      kthoom.rotateTimes--;
      if (kthoom.rotateTimes < 0) {
        kthoom.rotateTimes = 3;
      }
      updatePage();
      break;
    case Key.R:
      kthoom.rotateTimes++;
      if (kthoom.rotateTimes > 3) {
        kthoom.rotateTimes = 0;
      }
      updatePage();
      break;
    case Key.F:
      if (!hflip && !vflip) {
        hflip = true;
      } else if(hflip == true) {
        vflip = true;
        hflip = false;
      } else if(vflip == true) {
        vflip = false;
      }
      updatePage();
      break;
    case Key.W:
      fitMode = Key.W;
      updateScale();
      break;
    case Key.H:
      fitMode = Key.H;
      updateScale();
      break;
    case Key.B:
      fitMode = Key.B;
      updateScale();
      break;
    case Key.N:
      fitMode = Key.N;
      updateScale();
      break;
    default:
      break;
  }
}

function init() {
  document.body.className += /AppleWebKit/.test(navigator.userAgent) ? ' webkit' : '';
  document.addEventListener('keydown', keyHandler, false);
  window.addEventListener('resize', () => {
    const f = (screen.width - innerWidth < 4 && screen.height - innerHeight < 4);
    getElem('header').className = f ? 'fullscreen' : '';
    updateScale();
  }, false);
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
    switch (kthoom.rotateTimes) {
      case 0: clickedPrev = clickX < (comicWidth / 2); break;
      case 1: clickedPrev = clickY < (comicHeight / 2); break;
      case 2: clickedPrev = clickX > (comicWidth / 2); break;
      case 3: clickedPrev = clickY > (comicHeight / 2); break;
    }
    if (clickedPrev) {
      showPrevPage();
    } else {
      showNextPage();
    }
  }, false);
  getElem('libraryTab').addEventListener('click', () => toggleLibraryOpen(), false);

  loadHash();
}

function loadHash() {
  const hashcontent = window.location.hash.substr(1);
  if (hashcontent.lastIndexOf("ipfs", 0) === 0) {
    const ipfshash = hashcontent.substr(4);
    kthoom.ipfs.loadHash(ipfshash);
  }
}

/**
 * The main class for the kthoom reader.
 */
class KthoomApp {
  constructor() {
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
      // TODO: Move all of init() into this class.
      init();
      this.init_();
    });
  }

  /** @private */
  init_() {
    this.initProgressMeter_();
    this.initMenu_();
    this.initDragDrop_();
    this.initSwipe_();

    this.loadSettings_();

    console.log('kthoom initialized');
  }

  /** @private */
  initProgressMeter_() {
    const svg = document.getElementById('woot');
    svg.onclick = (e) => {
      let l = 0;
      const docEl = document.documentElement;
      for (let x = pdiv; x != docEl; x = x.parentNode) {
        l += x.offsetLeft;
      }
      const page = Math.max(1, Math.ceil(((e.clientX - l)/pdiv.offsetWidth) * totalImages)) - 1;
      currentImage = page;
      updatePage();
    };
  }

  /** @private */
  initMenu_() {
    getElem('menu').addEventListener('click', (evt) => evt.currentTarget.classList.toggle('opened'));
    getElem('menu-open-local-files').addEventListener('change', getLocalFiles, false);
    getElem('menu-open-google-drive').addEventListener('click', kthoom.google.doDrive, false);
    getElem('menu-open-ipfs-hash').addEventListener('click', kthoom.ipfs.ipfsHashWindow, false);
    getElem('menu-help').addEventListener('click', showOrHideHelp, false);
  }

  /** @private */
  initDragDrop_() {
    const swallowEvent = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('dragenter', swallowEvent, false);
    document.addEventListener('dragexit', swallowEvent, false);
    document.addEventListener('dragover', swallowEvent, false);
    document.addEventListener('drop', (e) => {
      swallowEvent(e);
      getLocalFiles({target: e.dataTransfer});
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
      const delta = (kthoom.rotateTimes %2 == 0 ? evt.deltaX : evt.deltaY);

      // If we turned the page, we won't let the page turn again until the delta
      // is below the hysteresis threshold (i.e. the swipe has lost its momentum).
      if (this.wheelTurnedPageAt_ !== 0) {
        if (Math.abs(delta) < SWIPE_THRESHOLD / 3) {
          this.wheelTurnedPageAt_ = 0;
        }
      } else {
        // If we haven't turned the page yet, see if this delta would turn the page.
        let turnPageFn = null;
        if (kthoom.rotateTimes <= 1) {
          if (delta > SWIPE_THRESHOLD) turnPageFn = showNextPage;
          else if (delta < -SWIPE_THRESHOLD) turnPageFn = showPrevPage;
        } else if (kthoom.rotateTimes <= 3) {
          if (delta < -SWIPE_THRESHOLD) turnPageFn = showNextPage;
          else if (delta > SWIPE_THRESHOLD) turnPageFn = showPrevPage;
        }
        if (turnPageFn) {
          turnPageFn();
          this.wheelTurnedPageAt_ = delta;
        }
      }
    }, true);
  }

  /** @private */
  loadSettings_() {
    try {
      if (localStorage[LOCAL_STORAGE_KEY].length < 10) return;
      const s = JSON.parse(localStorage[LOCAL_STORAGE_KEY]);
      kthoom.rotateTimes = s.rotateTimes;
      hflip = s.hflip;
      vflip = s.vflip;
      fitMode = s.fitMode;
    } catch(err) {}
  }

  initialized() { return this.initializedPromise_; }

  saveSettings() {
    localStorage[LOCAL_STORAGE_KEY] = JSON.stringify({
      rotateTimes: kthoom.rotateTimes,
      hflip: hflip,
      vflip: vflip,
      fitMode: fitMode,
    });
  }

  setProgressMeter(pct, opt_label) {
    pct = (pct*100);
    if (isNaN(pct)) pct = 1;
    const part = 1/totalImages;
    const remain = ((pct - lastCompletion)/100)/part;
    const fract = Math.min(1, remain);
    let smartpct = ((imageFiles.length/totalImages) + fract * part )* 100;
    if (totalImages == 0) smartpct = pct;

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

    let labelText = pct.toFixed(2) + '% ' + imageFiles.length + '/' + totalImages + '';
    if (opt_label) {
      labelText = opt_label + ' ' + labelText;
    }
    title.appendChild(document.createTextNode(labelText));

    getElem('meter2').setAttribute('width',
        100 * (totalImages == 0 ? 0 : ((currentImage+1)/totalImages)) + '%');

    title = getElem('page');
    while (title.firstChild) title.removeChild(title.firstChild);
    title.appendChild(document.createTextNode( (currentImage+1) + '/' + totalImages ));

    if (pct > 0) {
      getElem('nav').className = '';
      getElem('progress').className = '';
    }
  }

  loadFromArrayBuffer(ab) {
    const start = (new Date).getTime();
    const h = new Uint8Array(ab, 0, 10);
    const pathToBitJS = 'code/bitjs/';
    if (h[0] == 0x52 && h[1] == 0x61 && h[2] == 0x72 && h[3] == 0x21) { // Rar!
      unarchiver = new bitjs.archive.Unrarrer(ab, pathToBitJS);
    } else if (h[0] == 0x50 && h[1] == 0x4B) { // PK (Zip)
      unarchiver = new bitjs.archive.Unzipper(ab, pathToBitJS);
    } else if (h[0] == 255 && h[1] == 216) { // JPEG
      totalImages = 1;
      this.setProgressMeter(1, 'Archive Missing');
      const dataURI = createURLFromArray(new Uint8Array(ab), 'image/jpeg');
      setImage(dataURI);
      // hide logo
      getElem('logo').setAttribute('style', 'display:none');
      return;
    } else { // Try with tar
      unarchiver = new bitjs.archive.Untarrer(ab, pathToBitJS);
    }

    // Listen for UnarchiveEvents.
    if (unarchiver) {
      unarchiver.addEventListener(bitjs.archive.UnarchiveEvent.Type.PROGRESS,
        (e) => {
          const percentage = e.currentBytesUnarchived / e.totalUncompressedBytesInArchive;
          totalImages = e.totalFilesInArchive;
          this.setProgressMeter(percentage, 'Unzipping');
          // display nav
          lastCompletion = percentage * 100;
        });
      unarchiver.addEventListener(bitjs.archive.UnarchiveEvent.Type.INFO, (e) => console.log(e.msg));
      unarchiver.addEventListener(bitjs.archive.UnarchiveEvent.Type.EXTRACT,
        (e) => {
          // convert DecompressedFile into a bunch of ImageFiles
          if (e.unarchivedFile) {
            const f = e.unarchivedFile;
            // add any new pages based on the filename
            if (imageFilenames.indexOf(f.filename) == -1) {
              imageFilenames.push(f.filename);
              imageFiles.push(new ImageFile(f));
            }
          }

          // hide logo
          getElem('logo').setAttribute('style', 'display:none');

          // display first page if we haven't yet
          if (imageFiles.length == currentImage + 1) {
            updatePage();
          }
        });
      unarchiver.addEventListener(bitjs.archive.UnarchiveEvent.Type.FINISH,
        (e) => {
          const diff = ((new Date).getTime() - start)/1000;
          console.log('Unarchiving done in ' + diff + 's');
        })
      unarchiver.start();
    } else {
      alert('Some error');
    }
  }
}

const theApp = new KthoomApp();

if (!window.kthoom.getApp) {
  window.kthoom.getApp = () => theApp;
}
