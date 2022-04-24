/**
 * book-viewer.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

import { Book } from './book.js';
import { BookEvent, BookEventType } from './book-events.js';
import { FitMode } from './book-viewer-types.js';
import { LongStripPageSetter } from './pages/long-strip-page-setter.js';
import { OnePageSetter } from './pages/one-page-setter.js';
import { PageContainer } from './pages/page-container.js';
import { TwoPageSetter } from './pages/two-page-setter.js';
import { assert, getElem, Params } from './common/helpers.js';

/** @typedef {import('./book-viewer-types.js').Box} Box */
/** @typedef {import('./book-viewer-types.js').PageLayoutParams} PageLayoutParams */
/** @typedef {import('./book-viewer-types.js').PageSetting} PageSetting */

const BOOK_VIEWER_ELEM_ID = 'bookViewer';
const SWIPE_THRESHOLD = 50;

const THROBBER_TIMER_MS = 60;
const MAX_THROBBING_TIME_MS = 10000;
const NUM_THROBBERS = 4;
const THROBBER_WIDTH = 4.2;
const MIN_THROBBER_X = 3;
const MAX_THROBBER_X = 86;

// Statically rendered DOM elements.
const bvElem = getElem(BOOK_VIEWER_ELEM_ID);
const svgTop = getElem('pages');
const bvViewport = getElem('bvViewport');

/**
 * The BookViewer is responsible for letting the user view the current book, navigate its pages,
 * update the orientation, page-mode and fit-mode of the viewer. It delegates to PageSetters to
 * layout the pages.
 */
export class BookViewer {
  // All PageSetters.
  #onePageSetter = new OnePageSetter();
  #twoPageSetter = new TwoPageSetter();
  #longStripPageSetter = new LongStripPageSetter(); // Experimental.

  /** @type {Book} */
  #currentBook = null;

  /**
   * The current page number (zero-based).
   * @type {number}
   */
  #currentPageNum = -1;

  /**
   * The number of 90-degree clockwise rotations the viewer has. An integer from 0 to 3.
   * @type {number}
   */
  #rotateTimes = 0;

  /** @type {!FitMode} */
  #fitMode = FitMode.Best;

  /**
   * The number of pages visible in the viewer at one time. Defaults to 1
   * but can be set to 2 or 3 (long-strip mode).
   * @type {number}
   */
  #numPagesInViewer = 1;

  /** @type {PageContainer[]} */
  #pageContainers = [];

  constructor() {
    /**
     * Keep track of scroll of left.
     * TODO: Rename this to something better.
     * @type {number}
     */
    this.s = 0;

    /**
     * Keep track of scroll of top.
     * TODO: Rename this to something better.
     * @type {number}
     */
    this.t = 0;

    this.wheelTimer_ = null;
    this.wheelTurnedPageAt_ = 0;

    this.throbberTimerId_ = null;
    this.throbbers_ = new Array(NUM_THROBBERS);
    this.throbberDirections_ = new Array(NUM_THROBBERS);
    for (let thr = 0; thr < this.throbberDirections_.length; ++thr) {
      this.throbbers_[thr] = getElem(`throbber_${thr}`);
      this.throbberDirections_[thr] = (thr % 2 == 0) ? 1 : -1;
    }
    this.throbbingTime_ = 0;

    this.#initProgressMeter();
  }

  handleSwipeEvent(evt) {
    if (!this.#currentBook || this.getNumPagesInViewer() === 3) {
      return;
    }

    // Let scroll events happen if we are displaying text.
    if (evt.target.id === 'firstText') {
      return;
    }

    // TODO
    if (!Params.longStripView) {
      evt.preventDefault();
    }

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
    const delta = (this.#rotateTimes % 2 == 0 ? evt.deltaX : evt.deltaY);

    // If we turned the page, we won't let the page turn again until the delta
    // is below the hysteresis threshold (i.e. the swipe has lost its momentum).
    if (this.wheelTurnedPageAt_ !== 0) {
      if (Math.abs(delta) < SWIPE_THRESHOLD / 3) {
        this.wheelTurnedPageAt_ = 0;
      }
    } else {
      // If we haven't turned the page yet, see if this delta would turn the page.
      let turnPageFn = null;
      if (this.#rotateTimes <= 1) {
        if (delta > SWIPE_THRESHOLD) turnPageFn = () => this.showNextPage();
        else if (delta < -SWIPE_THRESHOLD) turnPageFn = () => this.showPrevPage();
      } else if (this.#rotateTimes <= 3) {
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
  handleEvent(evt) {
    this.#killThrobbing();

    if (evt.source === this.#currentBook) {
      switch (evt.type) {
        case BookEventType.PROGRESS:
          getElem('header').classList.add('animating');
          this.updateProgressMeter();
          break;
        case BookEventType.PAGE_EXTRACTED:
          // Display first page(s) if we haven't yet. If this is the long-strip view, update
          // layout every time we get a page so the top-level SVG is lengthened.
          if (evt.pageNum <= this.#numPagesInViewer ||
              this.getNumPagesInViewer() === 3) {
            this.updateLayout();
          } else {
            this.#updatePageMeter();
          }
          break;
        case BookEventType.BINDING_COMPLETE:
          getElem('header').classList.remove('animating');
          this.updateLayout();
          this.updateProgressMeter();

          this.#currentBook.removeEventListener(BookEventType.PROGRESS, this);
          this.#currentBook.removeEventListener(BookEventType.PAGE_EXTRACTED, this);
          this.#currentBook.removeEventListener(BookEventType.BINDING_COMPLETE, this);
    
          break;
      }
    }
  }

  /** @returns {number} The number of 90-degree clockwise rotations the book viewer has. */
  getRotateTimes() { return this.#rotateTimes; }

  /** @param {number} n The number of 90-degree clockwise rotations the book viewer should have. */
  setRotateTimes(n) {
    n = parseInt(n, 10) % 4;
    if (n < 0) n += 4;

    if (this.#rotateTimes !== n) {
      this.#rotateTimes = n;
      this.updateLayout();
    }
  }

  rotateCounterClockwise() {
    this.setRotateTimes(this.#rotateTimes - 1);
  }

  rotateClockwise() {
    this.setRotateTimes(this.#rotateTimes + 1);
  }

  /** @returns {FitMode} */
  getFitMode() { return this.#fitMode; }

  /** @param {FitMode} m */
  setFitMode(m) {
    if (this.#fitMode !== m) {
      this.#fitMode = m;
      this.updateLayout();
    }
  }

  /** @returns {number} The number of pages being shown in the viewer (1, 2, or 3). */
  getNumPagesInViewer() { return this.#numPagesInViewer; }

  /**
   * Sets the number of pages in the viewer (1-page, 2-page, or Long Strip (3) are supported).
   * @param {Number} numPages Can be 1, 2, or 3.
   */
  setNumPagesInViewer(numPages) {
    numPages = parseInt(numPages, 10);
    if (numPages !== 1 && numPages !== 2 && numPages !== 3) return;

    if (this.#numPagesInViewer !== numPages) {
      this.#numPagesInViewer = numPages;
      this.updateLayout();
    }
  }

  /**
   * Updates the layout based on window size, scale mode, fit mode, rotations, and page mode and
   * then sets the page contents based on the current page of the current book.  If there is no
   * current book, we clear the contents of all the page elements.
   */
  updateLayout() {
    if (!this.#currentBook || this.#currentPageNum === -1) {
      this.#clearPageContents();
      return;
    }

    this.#updatePageMeter();
    this.#updateProgressBackgroundPosition();

    const page = this.#currentBook.getPage(this.#currentPageNum);
    if (!page) {
      console.log('updateLayout() before current page is loaded');
      return;
    }

    // This is the dimensions of the book viewer "window".
    /** @type {Box} */
    const bv = {
      left: 0,
      width: bvElem.offsetWidth,
      top: 0,
      height: window.innerHeight - bvElem.offsetTop,
      // TODO: Eventually remove.
      ar: (bvElem.offsetWidth) / (window.innerHeight - bvElem.offsetTop),
    };
    assert(bv.width, 'bv.width not set');
    assert(bv.height, 'bv.height not set');

    const portraitMode = (this.#rotateTimes % 2 === 0);
    const par = page.getAspectRatio();

    let topw = bv.width, toph = bv.height;

    // This is the center of rotation, always rotating around the center of the book viewer.
    let rotx = bv.left + bv.width / 2;
    let roty = bv.top + bv.height / 2;
    let angle = 90 * this.#rotateTimes;

    /** @type {PageLayoutParams} */
    const layoutParams = {
      fitMode: this.#fitMode,
      rotateTimes: this.#rotateTimes,
      pageAspectRatio: page.getAspectRatio(),
      bv: {...bv},
    };

    /** @type {PageSetting} */
    let pageSetting;

    if (this.#numPagesInViewer === 1) {
      this.#showPageContainers(1);
      const page1 = this.#getPageContainer(0);

      pageSetting = this.#onePageSetter.updateLayout(layoutParams);
      assert(pageSetting.boxes.length === 1, `1-page setting did not have a box`);

      // Now size the page elements.
      const box1 = pageSetting.boxes[0];
      page1.setFrame(box1);
      this.#renderPageInContainer(this.#currentPageNum, page1);
    }
    // 2-page view.
    else if (this.#numPagesInViewer === 2) {
      this.#showPageContainers(2);
      const pages = [ this.#getPageContainer(0), this.#getPageContainer(1) ];

      pageSetting = this.#twoPageSetter.updateLayout(layoutParams);
      assert(pageSetting.boxes.length === 2, `2-page setting did not have two boxes`);

      for (let i = 0; i < 2; ++i) {
        pages[i].setFrame(pageSetting.boxes[i]);
      }

      this.#renderPageInContainer(this.#currentPageNum, pages[0]);
      this.#renderPageInContainer((this.#currentPageNum < this.#currentBook.getNumberOfPages() - 1) ?
          this.#currentPageNum + 1 : 0, pages[1]);
    }
    // long-strip view.
    else if (this.#numPagesInViewer === 3) {
      this.#showPageContainers(this.#currentBook.getNumberOfPages());
      const pageN = this.#pageContainers;

      // We make a starting assumption here that all pages will have the same aspect ratio as the
      // first page. As pages load in and this function is called again, we progressively update
      // the aspect ratio when possible.
      let aspectRatio;

      // Now size the page elements.
      for (const pageElem of page1Elems) {
        pageElem.removeAttribute('x'); 
        pageElem.removeAttribute('y');
        pageElem.removeAttribute('height'); 
        pageElem.removeAttribute('width');

        pageElem.setAttribute(
            'style',
            '-webkit-user-select: none;margin: auto;cursor: zoom-in;background-color: hsl(0, 0%, 90%);transition: background-color 300ms;');

        const bbox = pageElem.getBBox();
        if (bbox.width && bbox.height) {
          aspectRatio = bbox.width / bbox.height;
        }
        if (this.#fitMode === FitMode.Width ||
            (this.#fitMode === FitMode.Best && portraitMode)) {
          pageElem.setAttribute('width', window.innerWidth);
          if (!Number.isNaN(aspectRatio)) {
            pageElem.setAttribute('height', window.innerWidth / aspectRatio);
          }
        } else if (this.fitMode === FitMode.Height || (this.#fitMode === FitMode.Best && !portraitMode )) {
          pageElem.setAttribute('width', window.innerHeight);
          if (!Number.isNaN(aspectRatio)) {
            pageElem.setAttribute('height', window.innerHeight / aspectRatio);
          }
        }
      }
      for (const pageElem of page2Elems) {
        pageElem.removeAttribute('x'); 
        pageElem.removeAttribute('y');
        pageElem.removeAttribute('height'); 
        pageElem.removeAttribute('width');

        pageElem.setAttribute(
            'style',
            '-webkit-user-select: none;margin: auto;cursor: zoom-in;background-color: hsl(0, 0%, 90%);transition: background-color 300ms;');

        const bbox = pageElem.getBBox();
        if (bbox.width && bbox.height) {
          aspectRatio = bbox.width / bbox.height;
        }
        if (this.#fitMode === FitMode.Width ||
            (this.#fitMode === FitMode.Best && portraitMode)) {  
          pageElem.setAttribute('width', window.innerWidth);
          if (!Number.isNaN(aspectRatio)) {
            pageElem.setAttribute('height', window.innerWidth / aspectRatio);
          }
        } else if (this.fitMode === FitMode.Height || (this.#fitMode === FitMode.Best && !portraitMode )){
          pageElem.setAttribute('width', window.innerHeight);
          if (!Number.isNaN(aspectRatio)) {
            pageElem.setAttribute('height', window.innerHeight / aspectRatio);
          }
        }
       
        pageElem.setAttribute('y', getElem('page1Image').getBBox().height);
      }
      let position = parseFloat(getElem('page2Image').getBBox().y) +
          parseFloat(getElem('page2Image').getBBox().height);  // TODO: GetElem or from arrays
      let q = 1;
      for (const page of pageN) {
        if (q > 1) {
          position += getElem(`page${q+1}Image`).getBBox().height;
        }
        for (const pageElem of page) {
          pageElem.removeAttribute('x'); 
          pageElem.removeAttribute('y');
          pageElem.removeAttribute('height'); 
          pageElem.removeAttribute('width');

          pageElem.setAttribute(
              'style',
              '-webkit-user-select: none;margin: auto;cursor: zoom-in;background-color: hsl(0, 0%, 90%);transition: background-color 300ms;');

          const bbox = pageElem.getBBox();
          if (bbox.width && bbox.height) {
            aspectRatio = bbox.width / bbox.height;
          }
          if (this.#fitMode === FitMode.Width ||
              (this.#fitMode === FitMode.Best && portraitMode)) {
            pageElem.setAttribute('width', window.innerWidth);
            if (!Number.isNaN(aspectRatio)) {
              pageElem.setAttribute('height', window.innerWidth / aspectRatio);
            }
          } else if (this.fitMode === FitMode.Height || (this.#fitMode === FitMode.Best && !portraitMode )) {
            pageElem.setAttribute('width', window.innerHeight);
            if (!Number.isNaN(aspectRatio)) {
              pageElem.setAttribute('height', window.innerHeight / aspectRatio);
            }
          }
          pageElem.setAttribute('y', position);
        }
        if (portraitMode) {
          toph = position; 
          topw = window.innerWidth;     
        } else {
          topw = position;
          toph = window.innerWidth;
        }
        q += 1;
      }
      for (let i = 0; i < this.#currentBook.getNumberOfPages(); i++) {
        this.#showPageInViewer(i, getElem(`page${i + 1}`)); // TODO: add Promise.all()
      }
    } // long-strip view.

    if (pageSetting) {
      topw = pageSetting.bv.width;
      toph = pageSetting.bv.height;
    }

    // Rotate the book viewer viewport.
    const tr = `translate(${rotx}, ${roty}) rotate(${angle}) translate(${-rotx}, ${-roty})`;
    bvViewport.setAttribute('transform', tr);

    // Now size the top-level SVG element of the BookViewer.
    svgTop.style.display = '';
    svgTop.setAttribute('x', 0);
    svgTop.setAttribute('y', 0);
    svgTop.setAttribute('width', topw);
    svgTop.setAttribute('height', toph);

    if (this.getNumPagesInViewer() === 3 &&
        (document.getElementById('page2').getBoundingClientRect().top < 0 &&
        document.getElementById('page2').getBoundingClientRect().left < 0)) {
      let side = 0;
      if (Math.abs(document.getElementById('page2Image').getBoundingClientRect().top) >
          Math.abs(document.getElementById('page2Image').getBoundingClientRect().left)) {
        side = 1;
      } else {
        side = 0;
      }
      if (side === 1) {
        this.t += 1;
        this.s = 0;
        bvViewport.setAttribute('transform',  bvViewport.getAttribute('transform') +
            ` translate(0, ${-toph + Math.abs(getElem('page1').getBoundingClientRect().top)})`);

        if (this.t == 1) {
          getElem('page1').scrollIntoView(true);
        }
      }
      if (side === 0) {
        this.s += 1;
        this.t = 0;
        bvViewport.setAttribute('transform', bvViewport.getAttribute('transform') +
            ` translate(0, ${-topw + Math.abs(getElem('page1').getBoundingClientRect().top)})`);

        if (this.s == 1) {
          getElem('page1').scrollIntoView(true);
        }
        let setTo = 0;
        if (this.#fitMode === FitMode.Width ||
            (this.#fitMode === FitMode.Best && portraitMode )) {
          setTo = toph;
        } else if (this.fitMode === FitMode.Height || (this.#fitMode === FitMode.Best && !portraitMode )) {
          setTo = topw;
        }
  
        for (const pageElem of page1Elems) {
          pageElem.setAttribute('width', setTo);
        }
        for (const pageElem of page2Elems) {
          pageElem.setAttribute('width', setTo);
        }

        for (const page of pageN) {
          for (const pageElem of page) {
            pageElem.setAttribute('width', setTo);
          }
        }
        for (let i = 0; i < this.#currentBook.getNumberOfPages(); i++) {
          this.#showPageInViewer(i,getElem(`page${i + 1}`)); //TODO: add Promise.all()
        }
      }
    }  
  }

  /**
   * @param {Book} book
   */
  setCurrentBook(book) {
    if (book && this.#currentBook !== book) {
      this.closeBook();
      this.#killThrobbing();

      this.#currentBook = book;

      book.addEventListener(BookEventType.PROGRESS, this);
      book.addEventListener(BookEventType.PAGE_EXTRACTED, this);
      book.addEventListener(BookEventType.BINDING_COMPLETE, this);

      const getX = (el) => parseFloat(el.getAttribute('x'), 10);
      this.throbbers_.forEach(el => el.style.visibility = 'visible');
      this.throbberTimerId_ = setInterval(() => {
        this.throbbingTime_ += THROBBER_TIMER_MS;
        if (this.throbbingTime_ > MAX_THROBBING_TIME_MS) {
          this.#killThrobbing();
        }

        // Animate throbbers until first byte loads.
        const T = this.throbbers_.length;
        for (let thr = 0; thr < T; ++thr) {
          // Throbbers travel along the bar until they bump into another throbber or the edge.
          const prev = thr - 1;
          const next = thr + 1;
          const MIN_X = (prev >= 0) ? getX(this.throbbers_[prev]) + THROBBER_WIDTH : MIN_THROBBER_X;
          const MAX_X = (next < T) ? getX(this.throbbers_[next]) : MAX_THROBBER_X;

          // Advance throbber's position.
          let pos = getX(this.throbbers_[thr]) + this.throbberDirections_[thr];// * (1 + thr * 0.25);
          // If it hit something, reverse direction.
          if ((pos + THROBBER_WIDTH) >= MAX_X && this.throbberDirections_[thr] > 0) {
            pos = MAX_X;
            this.throbberDirections_[thr] = -1;
          } else if (pos <= MIN_X && this.throbberDirections_[thr] < 0) {
            pos = MIN_X;
            this.throbberDirections_[thr] = 1;
          }
          // Update position
          this.throbbers_[thr].setAttribute('x', `${pos}%`);
        }
      }, THROBBER_TIMER_MS);

      this.#currentPageNum = 0;
      this.updateProgressMeter();
      this.updateLayout();
    }
  }

  /**
   * Close the current book.
   */
  closeBook() {
    if (this.#currentBook) {
      this.#currentBook = null;
      this.#currentPageNum = -1;
    }

    getElem('loadmeter').setAttribute('width', '0%');
    getElem('zipmeter').setAttribute('width', '0%');
    getElem('layoutmeter').setAttribute('width', '0%');
    getElem('pagemeter').setAttribute('width', '0%');
    getElem('page').innerHTML = '0/0';

    this.updateProgressMeter();
    this.updateLayout();
  }

  /** @returns {boolean} If the next page was shown. */
  showPrevPage() {
    if (!this.#currentBook || this.#currentPageNum == 0) {
      return false;
    }

    this.#currentPageNum--;
    this.updateLayout();
    return true;
  }

  /** @returns {boolean} If the next page was shown. */
  showNextPage() {
    // If there is no current book, or the viewer is showing the last pages of the book, just return.
    if (!this.#currentBook ||
      (this.#currentPageNum >= this.#currentBook.getNumberOfPages() - this.#numPagesInViewer)) {
      return false;
    }

    this.#currentPageNum++;
    this.updateLayout();
    return true;
  }

  /** @param {number} n */
  showPage(n) {
    if (!this.#currentBook ||
      (n < 0 || n >= this.#currentBook.getNumberOfPages() || n === this.#currentPageNum)) {
      return;
    }
    this.#currentPageNum = n;
    this.updateLayout();
  }

  /**
   * Updates the book viewer meters based on the current book's progress.
   * @param {string} label
   */
  updateProgressMeter(label = undefined) {
    if (!this.#currentBook) {
      return;
    }

    // TODO: Test this.
    let loadingPct = this.#currentBook.getLoadingPercentage();
    let unzippingPct = this.#currentBook.getUnarchivingPercentage();
    let layingOutPct = this.#currentBook.getLayoutPercentage();
    let totalPages = this.#currentBook.getNumberOfPages();
    loadingPct = Math.max(0, Math.min(100 * loadingPct, 100));
    unzippingPct = Math.max(0, Math.min(100 * unzippingPct, 100));
    layingOutPct = Math.max(0, Math.min(100 * layingOutPct, 100));

    this.#animateMeterTo(loadingPct, 'loadmeter');
    this.#animateMeterTo(unzippingPct, 'zipmeter');
    this.#animateMeterTo(layingOutPct, 'layoutmeter');

    let bkgndWidth = Math.ceil(Math.log10(totalPages + 1)) * 2 + 1;
    getElem('page_bkgnd').setAttribute('width', `${bkgndWidth * 10}`);
    getElem('page').innerHTML = (this.#currentPageNum + 1) + '/' + totalPages;

    let title = getElem('progress_title');
    while (title.firstChild) title.removeChild(title.firstChild);

    let labelPct;
    let labelText;
    if (loadingPct < 100) {
      labelText = 'Loading';
      labelPct = loadingPct;
    } else if (unzippingPct < 100) {
      labelText = 'Unzipping';
      labelPct = unzippingPct;
    } else if (layingOutPct < 100) {
      labelText = 'Layout';
      labelPct = layingOutPct;
    } else {
      labelText = 'Complete'
      labelPct = 100;
    }
    if (label) {
      labelText = label;
    }
    title.appendChild(document.createTextNode(`${labelText} ${labelPct.toFixed(2)}% `));

    const progressBkgndWidth = (labelText.length + 4) * 10;
    getElem('progress_bkgnd').setAttribute('width', `${progressBkgndWidth}`);
    this.#updateProgressBackgroundPosition();

    // Update some a11y attributes of the progress meter.
    if (this.#currentBook) {
      const totalPct = (loadingPct + unzippingPct + layingOutPct) / 3;
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
    this.#updatePageMeter();
  }

  /**
   * @param {number} pct
   * @param {string} meterId
   */
   #animateMeterTo(pct, meterId) {
    getElem(meterId).setAttribute('width', pct + '%');
  }

  /** Wipes out the contents of all book viewer elements. */
  #clearPageContents() {
    for (const container of this.#pageContainers) {
      container.clear();
    }
  }

  /**
   * Gets the page container from the BookViewer viewport. If the ith container does not exist,
   * this method creates enough until there are i PageContainers in the viewport.
   * @param {number} i 
   * @returns {PageContainer}
   */
  #getPageContainer(i) {
    while (this.#pageContainers.length <= i) {
      const container = new PageContainer();
      this.#pageContainers.push(container);
      bvViewport.appendChild(container.getElement());
    }
    return this.#pageContainers[i];
  }

  #initProgressMeter() {
    const pdiv = getElem('progress');
    const svg = getElem('svgprogress');
    svg.addEventListener('click', (evt) => {
      let l = 0;
      const docEl = document.documentElement;
      for (let el = pdiv; el != docEl; el = el.parentNode) {
        l += el.offsetLeft;
      }
      const totalPages = this.#currentBook.getNumberOfPages();
      const page = Math.max(1, Math.ceil(((evt.clientX - l) / pdiv.offsetWidth) * totalPages)) - 1;
      this.#currentPageNum = page;
      this.updateLayout();
    });
  }

  #killThrobbing() {
    if (this.throbberTimerId_) {
      clearInterval(this.throbberTimerId_);
      this.throbberTimerId_ = null;
      this.throbbers_.forEach(el => el.style.visibility = 'hidden');
      this.throbbingTime_ = 0;
    }
  }


  /**
   * Renders contents of page number pageNum in the page viewer element.
   * @param {Number} pageNum The page number to render into the div.
   * @param {PageContainer} pageContainer The page container.
   */
  #renderPageInContainer(pageNum, pageContainer) {
    assert(this.#currentBook, 'Current book not defined in #showPageInContainer()');
    assert(this.#currentBook.getNumberOfPages() > pageNum,
      'Book does not have enough pages in #showPageInContainer()');

    const thePage = this.#currentBook.getPage(pageNum);
    // It's possible we are in a 2-page viewer, but the page is not in the book yet.
    if (!thePage) {
      return;
    }

    thePage.renderIntoContainer(pageContainer, pageNum);
  }

  /**
   * Shows n page containers and hides the rest. This may create page containers if needed.
   * @param {number} n
   */
  #showPageContainers(n) {
    assert(n > 0);
    const N = Math.max(this.#pageContainers.length, n);
    for (let i = 0; i < N; ++i) {
      this.#getPageContainer(i).show(i < n);
    }
  }

  /**
   * Renders contents of page number pageNum in the page viewer element.
   * TODO: Remove this method.
   * @param {Number} pageNum The page number to render into the div.
   * @param {SVGGElement} pageViewerEl The <g> for the page viewer.
   */
  #showPageInViewer(pageNum, pageViewerEl) {
    assert(this.#currentBook, 'Current book not defined in #showPageInViewer()');
    assert(this.#currentBook.getNumberOfPages() > pageNum,
      'Book does not have enough pages in #showPageInViewer()');

    const thePage = this.#currentBook.getPage(pageNum);
    // It's possible we are in a 2-page viewer, but the page is not in the book yet.
    if (!thePage) {
      return;
    }

    pageViewerEl.dataset.pagenum = pageNum;
    const imageEl = pageViewerEl.querySelector('image');
    const objEl = pageViewerEl.querySelector('foreignObject');
    thePage.renderIntoViewer(imageEl, objEl);
  }

  /** @private */
  #updatePageMeter() {
    const pageNum = this.#currentPageNum;
    const numPages = this.#currentBook.getNumberOfPages();
    getElem('page').innerHTML = (pageNum + 1) + '/' + numPages;
    getElem('pagemeter').setAttribute('width',
      100 * (numPages == 0 ? 0 : ((pageNum + this.#numPagesInViewer) / numPages)) + '%');
  }

  /** @private */
  #updateProgressBackgroundPosition() {
    const totalWidth = getElem('border').width.baseVal.value;
    const progressBkgnd = getElem('progress_bkgnd');
    const progressBkgndWidth = progressBkgnd.width.baseVal.value;
    progressBkgnd.setAttribute('x', totalWidth - progressBkgndWidth);
  }
}
