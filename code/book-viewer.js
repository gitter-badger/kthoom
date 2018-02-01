/**
 * book-viewer.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

import { Book, BookEvent, BookProgressEvent, Page,
    UnarchivePageExtractedEvent, UnarchiveCompleteEvent } from './book.js';
import { Key, getElem } from './helpers.js';

const SWIPE_THRESHOLD = 50;

/**
 * The BookViewer will be responsible for letting the user view a book, navigate its pages, update
 * the orientation / flip / and fit-mode of the viewer.  The BookViewer has a current book and is
 * responsible for the display of the current page.
 */
export class BookViewer {
  constructor() {
    this.currentBook_ = null;
    this.currentPageNum_ = -1;
    this.rotateTimes_ = 0;
    this.hflip_ = false;
    this.vflip_ = false;
    this.fitMode_ = Key.B;
    this.wheelTimer_ = null;
    this.wheelTurnedPageAt_ = 0;

    this.lastCompletion_ = 0;
    this.progressBarAnimationPromise_ = Promise.resolve(true);

    this.initProgressMeter_();
  }

  /** @private */
  initProgressMeter_() {
    const pdiv = getElem('progress');
    const svg = getElem('svgprogress');
    svg.addEventListener('click',  (evt) => {
      let l = 0;
      const docEl = document.documentElement;
      for (let el = pdiv; el != docEl; el = el.parentNode) {
        l += el.offsetLeft;
      }
      const totalPages = this.currentBook_.getNumberOfPages();
      const page = Math.max(1, Math.ceil(((evt.clientX - l)/pdiv.offsetWidth) * totalPages)) - 1;
      this.currentPageNum_ = page;
      this.updatePage();
    });
  }

  /** @private */
  handleSwipeEvent(evt) {
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
  }

  /**
   * @param {BookEvent} evt The BookEvent.
   * @private
   */
  handleBookEvent_(evt) {
    // If any event comes in and we are suddenly ready to unarchive,
    // then kick that off.
    if (this.currentBook_.isReadyToUnarchive()) {
      this.currentBook_.unarchive();
    }

    if (evt instanceof BookProgressEvent) {
      this.setProgressMeter({label: 'Opening'});
    } else if (evt instanceof UnarchivePageExtractedEvent) {
      // Display first page if we haven't yet.
      if (evt.pageNum == 1) {
        this.updatePage();
      }
    }
  }

  getRotateTimes() { return this.rotateTimes_; }

  setRotateTimes(n) {
    if (n >= 0 && n <= 3 && n !== this.rotateTimes_) {
      this.rotateTimes_ = n;
      this.updatePage();
    }
  }

  rotateCounterClockwise() {
    this.rotateTimes_--;
    if (this.rotateTimes_ < 0) {
      this.rotateTimes_ = 3;
    }
    this.updatePage();
  }

  rotateClockwise() {
    this.rotateTimes_++;
    if (this.rotateTimes_ > 3) {
      this.rotateTimes_ = 0;
    }
    this.updatePage();
  }

  isHflip() { return this.hflip_; }

  setHflip(f) {
    if (this.hflip_ !== f) {
      this.hflip_ = f;
    }
    this.updatePage();
  }

  isVflip() { return this.vflip_; }

  setVflip(f) {
    if (this.vflip_ !== f) {
      this.vflip_ = f;
    }
    this.updatePage();
  }

  flip() {
    if (!this.hflip_ && !this.vflip_) {
      this.hflip_ = true;
    } else if(this.hflip_ == true) {
      this.vflip_ = true;
      this.hflip_ = false;
    } else if(this.vflip_ == true) {
      this.vflip_ = false;
    }
    this.updatePage();
  }

  getFitMode() { return this.fitMode_; }

  setFitMode(m) {
    this.fitMode_ = m;
    this.updateScale();
  }

  updateScale(clear = false) {
    const mainImageStyle = getElem('mainImage').style;
    mainImageStyle.width = '';
    mainImageStyle.height = '';
    mainImageStyle.maxWidth = '';
    mainImageStyle.maxHeight = '';
    let maxheight = window.innerHeight - 15;
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
  }

  /**
   * @param {Book} book
   */
  setCurrentBook(book) {
    if (book && this.currentBook_ !== book) {
      this.closeBook();

      this.currentBook_ = book;
      book.subscribe(this, (evt) => this.handleBookEvent_(evt));
      this.currentPageNum_ = 0;
      this.setProgressMeter({label: 'Opening'});
      this.updatePage();

      // If the book is immediately ready to unarchive, kick that off.
      if (this.currentBook_.isReadyToUnarchive()) {
        this.currentBook_.unarchive();
      }
    }
  }

  /** @private */
  closeBook() {
    if (this.currentBook_) {
      this.currentBook_.unsubscribe(this);
      this.currentBook_ = null;
    }

    this.lastCompletion_ = 0;

    getElem('nav').classList.add('hide');
    getElem('progress').classList.add('hide');
    getElem('loadmeter').setAttribute('width', '0%');
    getElem('zipmeter').setAttribute('width', '0%');
    getElem('pagemeter').setAttribute('width', '0%');

    this.setProgressMeter();
    this.updatePage();
  }

  // TODO: Remove this for just showPage(n) to simplify the interface?
  updatePage() {
    if (!this.currentBook_) return;

    const pageNum = this.currentPageNum_;
    const numPages = this.currentBook_.getNumberOfPages();
    const title = getElem('page');
    while (title.firstChild) title.removeChild(title.firstChild);
    title.appendChild(document.createTextNode((pageNum + 1) + '/' + numPages));

    getElem('pagemeter').setAttribute('width',
        100 * (numPages == 0 ? 0 : ((pageNum + 1) / numPages)) + '%');
    const page = this.currentBook_.getPage(pageNum);
    if (page && page.imageFile) {
      this.setImage(page.imageFile.dataURI);
    } else {
      this.setImage('loading');
    }
  }

  /** @return {boolean} If the next page was shown. */
  showPrevPage() {
    if (this.currentPageNum_ == 0) return false;

    this.currentPageNum_--;
    this.updatePage();
    return true;
  }

  /** @return {boolean} If the next page was shown. */
  showNextPage() {
    if (this.currentPageNum_ == this.currentBook_.getNumberOfPages() - 1) return false;

    this.currentPageNum_++;
    this.updatePage();
    return true;
  }

  showPage(n) {
    if (n < 0 || n >= this.currentBook_.getNumberOfPages() || n == this.currentPageNum_) {
      return;
    }
    this.currentPageNum_ = n;
    this.updatePage();
  }

  animateUnzipMeterTo_(pct) {
    if (this.lastCompletion_ >= pct) return;

    this.progressBarAnimationPromise_ = this.progressBarAnimationPromise_.then(() => {
      let partway = (pct - this.lastCompletion_) / 2;
      if (partway < 0.001) {
        partway = pct - this.lastCompletion_;
      }
      this.lastCompletion_ = Math.min(this.lastCompletion_ + partway, pct);

      getElem('zipmeter').setAttribute('width', this.lastCompletion_ + '%');

      if (this.lastCompletion_ < pct) {
        setTimeout(() => this.animateUnzipMeterTo_(pct), 50);
      }
    });
  }

  setProgressMeter({loadPct = 0, unzipPct = 0, label = ''} = {}) {
    const previousUnzippingPct = this.lastCompletion_;
    let loadingPct = loadPct;
    let unzippingPct = unzipPct;
    if (this.currentBook_) {
      loadingPct = this.currentBook_.getLoadingPercentage();
      unzippingPct = this.currentBook_.getUnarchivingPercentage();
    }
    loadingPct = Math.max(0, Math.min(100 * loadingPct, 100));
    unzippingPct = Math.max(0, Math.min(100 * unzippingPct, 100));

    getElem('loadmeter').setAttribute('width', loadingPct + '%');
    this.animateUnzipMeterTo_(unzippingPct);

    let title = getElem('progress_title');
    while (title.firstChild) title.removeChild(title.firstChild);

    let labelText = unzippingPct.toFixed(2) + '% ';
    if (label.length > 0) {
      labelText = label + ' ' + labelText;
    }
    title.appendChild(document.createTextNode(labelText));

    if (loadingPct > 0 || unzippingPct > 0) {
      getElem('nav').classList.remove('hide');
      getElem('progress').classList.remove('hide');
    }
  }

  setImage(url) {
    const canvas = getElem('mainImage');
    const prevImage = getElem('prevImage');
    const ctx = canvas.getContext('2d');
    getElem('mainText').style.display = 'none';
    if (url == 'loading') {
      this.updateScale(true);
      canvas.width = window.innerWidth - 100;
      canvas.height = 200;
      ctx.fillStyle = 'red';
      ctx.font = '50px sans-serif';
      ctx.strokeStyle = 'black';
      ctx.fillText('Loading Page #' + (this.currentPageNum_ + 1), 100, 100);
    } else {
      if (document.body.scrollHeight / window.innerHeight > 1) {
        document.body.style.overflowY = 'scroll';
      }

      const img = new Image();
      img.onerror = (e) => {
        canvas.width = window.innerWidth - 100;
        canvas.height = 300;
        this.updateScale(true);
        ctx.fillStyle = 'orange';
        ctx.font = '32px sans-serif';
        ctx.strokeStyle = 'black';
        const page = this.currentBook_.getPage(this.currentPageNum_);
        const imageFilename = page.filename;
        ctx.fillText('Page #' + (this.currentPageNum_ + 1) + ' (' + imageFilename + ')', 100, 100);

        if (/(html|htm)$/.test(page.imageFile.filename)) {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onload = () => {
            getElem('mainText').style.display = '';
            getElem('mainText').innerHTML = '<iframe style="width:100%;height:700px;border:0" src="data:text/html,'+escape(xhr.responseText)+'"></iframe>';
          }
          xhr.send(null);
        } else if (!/(jpg|jpeg|png|gif)$/.test(imageFilename)) {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onload = () => {
            if (xhr.responseText.length < 10*1024) {
              getElem('mainText').style.display = '';
              getElem('mainText').innerText = xhr.responseText;
            } else {
              ctx.fillText('Cannot display this type of file', 100, 200);
            }
          };
          xhr.send(null);
        }
      };
      img.onload = () => {
        const h = img.height;
        const w = img.width;
        let sw = w;
        let sh = h;
        this.rotateTimes_ = (4 + this.rotateTimes_) % 4;
        ctx.save();
        if (this.rotateTimes_ % 2 == 1) { sh = w; sw = h;}
        canvas.height = sh;
        canvas.width = sw;
        ctx.translate(sw/2, sh/2);
        ctx.rotate(Math.PI/2 * this.rotateTimes_);
        ctx.translate(-w/2, -h/2);
        if (this.vflip_) {
          ctx.scale(1, -1)
          ctx.translate(0, -h);
        }
        if (this.hflip_) {
          ctx.scale(-1, 1)
          ctx.translate(-w, 0);
        }
        canvas.style.display = 'none';
        window.scrollTo(0,0);
        ctx.drawImage(img, 0, 0);

        this.updateScale();

        canvas.style.display = '';
        document.body.style.overflowY = '';
        ctx.restore();
      };
      if (img.src) {
        prevImage.setAttribute('src', img.src);
      }
      img.src = url;
    };
  }
}
