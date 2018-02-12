/**
 * book-viewer.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

import { Book, BookEvent, BookProgressEvent, UnarchivePageExtractedEvent,
         UnarchiveCompleteEvent } from './book.js';
import { Key, getElem } from './helpers.js';
import { ImagePage, TextPage } from './page.js';

const SWIPE_THRESHOLD = 50;

// TODO: Sometimes the first page is not rendered properly.
/**
 * The BookViewer is responsible for letting the user view the current book, navigate its pages,
 * update the orientation / flip / and fit-mode of the viewer.
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

    this.numPagesInViewer_ = 1;

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
    if (!this.currentBook_) {
      return;
    }

    // Let scroll events happen if we are displaying text.
    if (evt.target.id === 'mainText') {
      return;
    }

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

  /**
   * Sets the number of pages in the viewer (1- or 2-page viewer are supported).
   * @param {Number} numPages Can be 1 or 2
   */
  setPagesInViewer(numPages) {
    numPages = parseInt(numPages, 10);
    if (numPages < 1 || numPages > 2) return;

    this.numPagesInViewer_ = numPages;
    alert('not yet');
  }

  /**
   * Updates the scale on the Book Viewer's image so that it matches the scale mode.
   * @param {boolean} clear Clears the styles and returns immediately.
   */
  updateScale(clear = false) {
    const mainImageStyle = getElem('mainImage').style;
    mainImageStyle.width = '';
    mainImageStyle.height = '';
    mainImageStyle.maxWidth = '';
    mainImageStyle.maxHeight = '';

    if (clear) {
      return;
    }

    let maxheight = window.innerHeight - 15;
    if (!getElem('header').classList.contains('fullscreen')) {
      maxheight -= 25;
    }

    if (this.fitMode_ == Key.B) {
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

  /**
   * Updates the viewer and page meter to display the current page.
   */
  updatePage() {
    if (!this.currentBook_) return;

    const pageNum = this.currentPageNum_;
    const numPages = this.currentBook_.getNumberOfPages();
    getElem('page').innerHTML = (pageNum + 1) + '/' + numPages;
    getElem('pagemeter').setAttribute('width',
        100 * (numPages == 0 ? 0 : ((pageNum + 1) / numPages)) + '%');

    this.setPage(this.currentBook_.getPage(pageNum));
  }

  /** @return {boolean} If the next page was shown. */
  showPrevPage() {
    if (!this.currentBook_ || this.currentPageNum_ == 0) {
      return false;
    }

    this.currentPageNum_--;
    this.updatePage();
    return true;
  }

  /** @return {boolean} If the next page was shown. */
  showNextPage() {
    if (!this.currentBook_ ||
        this.currentPageNum_ == this.currentBook_.getNumberOfPages() - 1) {
      return false;
    }

    this.currentPageNum_++;
    this.updatePage();
    return true;
  }

  showPage(n) {
    if (!this.currentBook_ ||
        (n < 0 || n >= this.currentBook_.getNumberOfPages() || n == this.currentPageNum_)) {
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

  /**
   * @param {Page} page The page to load. If not set, the viewer shows a loading message.
   */
  setPage(page = undefined) {
    const canvas = getElem('mainImage');
    const ctx = canvas.getContext('2d');
    getElem('mainText').style.display = 'none';
    getElem('mainImage').style.display = '';
    if (!page) {
      this.updateScale(true);
      canvas.width = window.innerWidth - 100;
      canvas.height = 200;
      ctx.fillStyle = 'red';
      ctx.font = '50px sans-serif';
      ctx.strokeStyle = 'black';
      ctx.fillText('Loading Page #' + (this.currentPageNum_ + 1), 100, 100);
      return;
    }

    if (document.body.scrollHeight / window.innerHeight > 1) {
      document.body.style.overflowY = 'scroll';
    }

    if (page instanceof ImagePage) {
      const img = page.img;
      const h = img.height;
      const w = img.width;
      let sw = w;
      let sh = h;
      if (this.rotateTimes_ % 2 == 1) { sh = w; sw = h; }

      canvas.height = sh;
      canvas.width = sw;

      ctx.save();

      // Account for rotation.
      ctx.translate(sw/2, sh/2);
      ctx.rotate(Math.PI/2 * this.rotateTimes_);
      ctx.translate(-w/2, -h/2);

      // Account for flip.
      if (this.vflip_) {
        ctx.scale(1, -1);
        ctx.translate(0, -h);
      }
      if (this.hflip_) {
        ctx.scale(-1, 1);
        ctx.translate(-w, 0);
      }

      ctx.drawImage(img, 0, 0);

      ctx.restore();

      this.updateScale();

      // Scroll back to the top (in case there was a long text page previously)
      window.scrollTo(0,0);
      document.body.style.overflowY = '';
    } else if (page instanceof TextPage) {
      getElem('mainImage').style.display = 'none';
      getElem('mainText').style.display = '';
      getElem('mainText').innerText = page.rawText;
    } else if (page instanceof HtmlPage) {
      getElem('mainImage').style.display = 'none';
      getElem('mainText').style.display = '';
      getElem('mainText').innerHTML =
          '<iframe style="width:100%;height:700px;border:0" src="data:text/html,' +
          page.escapedHtml +
          '"></iframe>';
    } else {
      ctx.fillText('Cannot display this type of file', 100, 200);
    }
  }
}
