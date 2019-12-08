/**
 * book-viewer.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

import { Book, BookEvent, BookProgressEvent, UnarchivePageExtractedEvent,
         UnarchiveCompleteEvent } from './book.js';
import { assert, getElem } from './helpers.js';
import { ImagePage, HtmlPage, TextPage } from './page.js';

const BOOK_VIEWER_ELEM_ID = 'bookViewer';
const ID_PAGE_1 = 'page1';
const ID_PAGE_2 = 'page2';
const SWIPE_THRESHOLD = 50;

export const FitMode = {
  Width: 1,
  Height: 2,
  Best: 3,
}

const px = v => v + 'px';

/**
 * The BookViewer is responsible for letting the user view the current book, navigate its pages,
 * update the orientation, page-mode and fit-mode of the viewer.
 */
export class BookViewer {
  constructor() {
    this.currentBook_ = null;
    this.currentPageNum_ = -1;
    this.rotateTimes_ = 0;
    /** @type {!FitMode} */
    this.fitMode_ = FitMode.Best;
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
      this.updateLayout();
    });
  }

  /** @private */
  handleSwipeEvent(evt) {
    if (!this.currentBook_) {
      return;
    }

    // Let scroll events happen if we are displaying text.
    if (evt.target.id === 'firstText') {
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
      getElem('header').classList.add('animating');
      this.setProgressMeter({label: 'Opening'});
    } else if (evt instanceof UnarchivePageExtractedEvent) {
      // Display first page if we haven't yet.
      if (evt.pageNum == 1) {
        this.updateLayout();
      }
    } else if (evt instanceof UnarchiveCompleteEvent) {
      getElem('header').classList.remove('animating');
      this.setProgressMeter(1, 1);
    }
  }

  getRotateTimes() { return this.rotateTimes_; }

  setRotateTimes(n) {
    n = parseInt(n, 10) % 4;
    if (n < 0) n += 4;

    if (this.rotateTimes_ !== n) {
      this.rotateTimes_ = n;
      this.updateLayout();
    }
  }

  rotateCounterClockwise() {
    this.setRotateTimes(this.rotateTimes_ - 1);
  }

  rotateClockwise() {
    this.setRotateTimes(this.rotateTimes_ + 1);
  }

  getFitMode() { return this.fitMode_; }

  setFitMode(m) {
    this.fitMode_ = m;
    this.updateLayout();
  }

  getNumPagesInViewer() { return this.numPagesInViewer_; }

  /**
   * Sets the number of pages in the viewer (1- or 2-page viewer are supported).
   * @param {Number} numPages Can be 1 or 2
   */
  setNumPagesInViewer(numPages) {
    numPages = parseInt(numPages, 10);
    if (numPages < 1 || numPages > 2) return;

    if (this.numPagesInViewer_ !== numPages) {
      this.numPagesInViewer_ = numPages;
      getElem(ID_PAGE_2).style.display = (numPages === 2) ? '' : 'none';
      this.updateLayout();
    }
  }

  /**
   * Updates the layout based on window size, scale mode, fit mode and page mode
   * and then sets the page contents based on the current page of the current book.
   * If there is no current book, we clear the contents of all the canvas elements.
   */
  updateLayout() {
    if (!this.currentBook_ || this.currentPageNum_ === -1) {
      this.clearPageContents_();
      return;
    }

    const pageNum = this.currentPageNum_;
    const numPages = this.currentBook_.getNumberOfPages();
    getElem('page').innerHTML = (pageNum + 1) + '/' + numPages;
    getElem('pagemeter').setAttribute('width',
        100 * (numPages == 0 ? 0 : ((pageNum + 1) / numPages)) + '%');

    const page = this.currentBook_.getPage(this.currentPageNum_);
    if (!page) {
      console.log('updateLayout() before current page is loaded');
      return;
    }

    const portraitMode = (this.rotateTimes_ % 2 === 0);
    const par = portraitMode ? page.getAspectRatio() : 1 / page.getAspectRatio();

    const bvElem = getElem(BOOK_VIEWER_ELEM_ID);
    const bv = {
      left: 5,
      width: bvElem.offsetWidth - 10,
      top: bvElem.offsetTop + 5,
      height: window.innerHeight - bvElem.offsetTop - 10,
      ar: (bvElem.offsetWidth) / (window.innerHeight - bvElem.offsetTop),
    };
    assert(bv.width, 'bv.width not set');
    assert(bv.height, 'bv.height not set');

    const page1 = getElem(ID_PAGE_1);
    const page2 = getElem(ID_PAGE_2);
    // Single page viewer mode.
    if (this.numPagesInViewer_ === 1) {
      page2.style.display = 'none';

      // fit-width, 1-page
      // fit-best, 1-page
      if (this.fitMode_ === FitMode.Width ||
          (this.fitMode_ === FitMode.Best && bv.ar <= par)) {
        page1.style.left = px(bv.left);
        page1.style.width = px(bv.width);
        const ph = bv.width / par;
        page1.style.height = px(ph);
        if (par > bv.ar) {
          page1.style.top = px(bv.top + bv.height / 2 - ph / 2);
        } else {
          page1.style.top = px(bv.top);
        }
      } else {
        // fit-height, 1-page
        // fit-best, 1-page
        page1.style.top = px(bv.top);
        page1.style.height = px(bv.height);
        const pw = bv.height * par;
        page1.style.width = px(pw);
        if (par < bv.ar) {
          page1.style.left = px(bv.left + bv.width / 2 - pw / 2);
        } else {
          page1.style.left = px(bv.left);
        }
      }

      this.setPageContents_(page1, this.currentPageNum_);
    } else if (this.numPagesInViewer_ === 2) {
      // Two-page viewer mode.
      page2.style.display = '';

      if (portraitMode) {
        const bv1 = {
          left: bv.left,
          width: bv.width / 2,
          top: bv.top,
          height: bv.height,
          ar: (bv.width / 2) / bv.height,
        };
        const bv2 = {
          left: bv.left + (bv.width / 2),
          width: bv1.width,
          top: bv1.top,
          height: bv1.height,
          ar: bv1.ar,
        };

        // portrait, fit-width, 2-page
        // portrait, fit-best, 1-page
        if (this.fitMode_ === FitMode.Width ||
            (this.fitMode_ === FitMode.Best && bv1.ar <= par)) {
          page1.style.left = px(bv1.left);
          page1.style.width = px(bv1.width);
          const ph = bv1.width / par;
          page1.style.height = px(ph);
          if (par > bv1.ar) {
            page1.style.top = px(bv1.top + bv1.height / 2 - ph / 2);
          } else {
            page1.style.top = px(bv1.top);
          }

          page2.style.left = px(bv2.left);
          page2.style.width = px(bv2.width);
          page2.style.height = px(ph);
          if (par > bv2.ar) {
            page2.style.top = px(bv2.top + bv2.height / 2 - ph / 2);
          } else {
            page2.style.top = px(bv2.top);
          }
        } else {
          // portrait, fit-height, 2-page
          // portrait, fit-best, 2-page
          page1.style.top = px(bv1.top);
          page1.style.height = px(bv1.height);
          const pw = bv1.height * par;
          page1.style.width = px(pw);
          let p1left;
          if (par < bv1.ar) {
            p1left = bv1.left + bv1.width - pw;
          } else {
            p1left = bv1.left;
          }
          page1.style.left = px(p1left);

          page2.style.top = px(bv2.top);
          page2.style.height = px(bv2.height);
          page2.style.width = px(pw);
          page2.style.left = px(p1left + pw);
        }
      } else {
        const bv1 = {
          left: bv.left,
          width: bv.width,
          top: bv.top,
          height: (bv.height / 2),
          ar: bv.width / (bv.height / 2),
        };
        const bv2 = {
          left: bv1.left,
          width: bv1.width,
          top: bv.top + (bv.height / 2),
          height: bv1.height,
          ar: bv1.ar,
        };

        // landscape, fit-width, 2-page
        // landscape, fit-best, 2-page
        if (this.fitMode_ === FitMode.Width ||
            (this.fitMode_ === FitMode.Best && bv1.ar <= par)) {
          page1.style.left = px(bv1.left);
          page1.style.width = px(bv1.width);
          const ph = bv1.width / par;
          page1.style.height = px(ph);
          let p1top;
          if (par > bv1.ar) {
            p1top = bv1.top + bv1.height / 2 - ph / 2;
          } else {
            p1top = bv1.top;
          }
          page1.style.top = px(p1top);

          page2.style.left = px(bv2.left);
          page2.style.width = px(bv2.width);
          page2.style.height = px(ph);
          page2.style.top = px(p1top + ph);
        } else {
          // landscape, fit-height, 2-page
          // landscape, fit-best, 2-page
          page1.style.top = px(bv1.top);
          page1.style.height = px(bv1.height);
          const pw = bv1.height * par;
          page1.style.width = px(pw);
          let p1left;
          if (par < bv1.ar) {
            p1left = bv1.left + bv1.width / 2 - pw / 2;
          } else {
            p1left = bv1.left;
          }
          page1.style.left = px(p1left);

          page2.style.top = px(bv2.top);
          page2.style.height = px(bv2.height);
          page2.style.width = px(pw);
          page2.style.left = px(p1left);
        }
      }

      const pageA = (this.rotateTimes_ >= 2) ? page2 : page1;
      const pageB = (this.rotateTimes_ >= 2) ? page1 : page2;
      this.setPageContents_(pageA, this.currentPageNum_);
      this.setPageContents_(pageB,
        (this.currentPageNum_ < this.currentBook_.getNumberOfPages() - 1) ?
        this.currentPageNum_ + 1 : 0);
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
      this.updateLayout();

      // If the book is immediately ready to unarchive, kick that off.
      if (this.currentBook_.isReadyToUnarchive()) {
        this.currentBook_.unarchive();
      }
    }
  }

  /**
   * Close the current book.
   */
  closeBook() {
    if (this.currentBook_) {
      this.currentBook_.unsubscribe(this);
      this.currentBook_ = null;
      this.currentPageNum_ = -1;
    }

    this.lastCompletion_ = 0;

    getElem('loadmeter').setAttribute('width', '0%');
    getElem('zipmeter').setAttribute('width', '0%');
    getElem('pagemeter').setAttribute('width', '0%');
    getElem('page').innerHTML = '0/0';

    this.setProgressMeter();
    this.updateLayout();
  }

  /** @return {boolean} If the next page was shown. */
  showPrevPage() {
    if (!this.currentBook_ || this.currentPageNum_ == 0) {
      return false;
    }

    this.currentPageNum_--;
    this.updateLayout();
    return true;
  }

  /** @return {boolean} If the next page was shown. */
  showNextPage() {
    if (!this.currentBook_ ||
        this.currentPageNum_ == this.currentBook_.getNumberOfPages() - 1) {
      return false;
    }

    this.currentPageNum_++;
    this.updateLayout();
    return true;
  }

  showPage(n) {
    if (!this.currentBook_ ||
        (n < 0 || n >= this.currentBook_.getNumberOfPages() || n == this.currentPageNum_)) {
      return;
    }
    this.currentPageNum_ = n;
    this.updateLayout();
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

  /**
   * The loadPct, unzipPct fields of the input params are not currently
   * used (the values from the current book are used instead).
   * @param {number} loadPct The current percentage loaded, a number from 0 to 1.
   * @param {number} unzipPct The current percentage unzipped, a number from 0 to 1.
   * @param {string} label A label to prepend to the progress title text.
   */
  setProgressMeter({loadPct = 0, unzipPct = 0, label = ''} = {}) {
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

    // Update some a11y attributes of the progress meter.
    if (this.currentBook_) {
      const totalPct = (loadingPct + unzippingPct) / 2;
      const totalPctStr = totalPct.toFixed(2) + '%';
      const bvElem = getElem(BOOK_VIEWER_ELEM_ID);
      const progressElem = getElem('progress');
      progressElem.setAttribute('aria-label', totalPctStr);
      if (totalPctStr !== '100.00%') {
        bvElem.setAttribute('aria-busy', 'true');
        bvElem.setAttribute('aria-describedby', 'progress');
        progressElem.setAttribute('aria-valuenow', totalPct);
        progressElem.setAttribute('aria-valuemin', '0');
        progressElem.setAttribute('aria-valuemax', '100');
      } else {
        bvElem.setAttribute('aria-busy', 'false');
        bvElem.removeAttribute('aria-describedBy');
        progressElem.removeAttribute('aria-valuenow');
        progressElem.removeAttribute('aria-valuemin');
        progressElem.removeAttribute('aria-valuemax');
      }
    }
  }

  /**
   * Wipes out the contents of all canvas elements.
   */
  clearPageContents_() {
    const pageIds = [ID_PAGE_1, ID_PAGE_2];
    for (const pageId of pageIds) {
      const canvasEls = getElem(pageId).querySelectorAll('canvas');
      for (let i = 0; i < canvasEls.length; ++i) {
        const canvas = canvasEls.item(i);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  /**
   * @param {Element} pageEl The div for the page.
   * @param {Number} pageNum The page number to render into the div.
   * @private
   */
  setPageContents_(pageEl, pageNum) {
    assert(this.currentBook_, 'Current book not defined in setPageContents_()');
    assert(this.currentBook_.getNumberOfPages() > pageNum,
        'Book does not have enough pages in setPageContents_()');

    const page = this.currentBook_.getPage(pageNum);
    assert(page, 'Page not defined in setPageContents_()');
    const textDiv = pageEl.querySelector('div');
    const canvasEl = pageEl.querySelector('canvas');
    assert(canvasEl, 'Canvas not found in pageEl in setPageContents_()');
    const ctx = canvasEl.getContext('2d');

    if (page instanceof ImagePage) {
      canvasEl.style.display = '';
      textDiv.style.display = 'none';
      const img = page.img;
      const h = img.height;
      const w = img.width;
      let sw = w;
      let sh = h;
      if (this.rotateTimes_ % 2 == 1) { sh = w; sw = h; }

      canvasEl.height = sh;
      canvasEl.width = sw;

      ctx.save();
      ctx.translate(sw/2, sh/2);
      ctx.rotate(Math.PI/2 * this.rotateTimes_);
      ctx.translate(-w/2, -h/2);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    } else if (page instanceof HtmlPage) {
      canvasEl.style.display = 'none';
      textDiv.style.display = '';
      textDiv.innerHTML =
          '<iframe style="width:100%;height:700px;border:0" src="data:text/html,' +
          page.escapedHtml +
          '"></iframe>';
    } else if (page instanceof TextPage) {
      canvasEl.style.display = 'none';
      textDiv.style.display = '';
      textDiv.innerText = page.rawText;
    } else {
      ctx.fillText('Cannot display this type of file', 100, 200);
    }
  }
}
