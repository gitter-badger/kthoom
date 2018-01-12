import { Book, BookEvent, Page, LoadCompleteEvent, LoadProgressEvent,
  UnarchiveProgressEvent, UnarchivePageExtractedEvent, UnarchiveCompleteEvent } from './book.js';
import { Key, getElem } from './helpers.js';

const SWIPE_THRESHOLD = 50; // TODO: Tweak this?

/**
 * The BookViewer will be responsible for letting the user view a book, navigate its pages, update
 * the orientation / flip / and fit-mode of the viewer.  The BookViewer has a current book and is
 * responsible for the display of the current page.
 */
export class BookViewer {
  constructor() {
    this.currentBook_ = null;
    this.currentPage_ = null;
    this.currentPageNum_ = -1;

    this.rotateTimes_ = 0;
    this.hflip_ = false;
    this.vflip_ = false;
    this.fitMode_ = Key.B;

    this.wheelTimer_ = null;
    this.wheelTurnedPageAt_ = 0;

    this.lastCompletion_ = 0;

    this.initProgressMeter_();
    this.initSwipe_();
  }

  /** @private */
  initProgressMeter_() {
    const pdiv = getElem('progress');
    const svg = getElem('svgprogress');
    svg.onclick = (evt) => {
      let l = 0;
      const docEl = document.documentElement;
      for (let el = pdiv; el != docEl; el = el.parentNode) {
        l += el.offsetLeft;
      }
      const totalPages = this.currentBook_.getNumberOfPages();
      const page = Math.max(1, Math.ceil(((evt.clientX - l)/pdiv.offsetWidth) * totalPages)) - 1;
      this.currentPageNum_ = page;
      this.updatePage();
    };
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

  /**
   * @param {BookEvent} evt The BookEvent.
   * @private
   */
  handleBookEvent_(evt) {
    if (evt instanceof LoadProgressEvent) {
      this.lastCompletion_ = evt.percentage * 100;
      this.setProgressMeter(evt.percentage, 'Loading');
    } else if (evt instanceof LoadCompleteEvent) {
      this.currentBook_.unarchive();
    } else if (evt instanceof UnarchiveProgressEvent) {
      this.lastCompletion_ = evt.percentage * 100;
      this.setProgressMeter(evt.percentage, 'Unzipping');
    } else if (evt instanceof UnarchivePageExtractedEvent) {
      // Display first page if we haven't yet.
      if (evt.pageNum == 1) {
        this.updatePage();
      }
    }
  }

  // TODO: Use timer ids here to prevent cancelling an earlier operation.
  /** @private */
  showHeaderPreview_() {
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
      this.currentPage_ = book.getPage(0);
      this.currentPageNum_ = 0;

      if (!book.isUnarchived() && book.isLoaded()) {
        book.unarchive();
      } else {
        this.setProgressMeter(1);
        this.updatePage();
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

    getElem('nav').className = 'hide';
    getElem('progress').className = 'hide';
    getElem('meter').setAttribute('width', '0%');

    this.setProgressMeter(0);
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

    getElem('meter2').setAttribute('width',
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
    this.showHeaderPreview_();
    return true;
  }

  /** @return {boolean} If the next page was shown. */
  showNextPage() {
    if (this.currentPageNum_ == this.currentBook_.getNumberOfPages() - 1) return false;

    this.currentPageNum_++;
    this.updatePage();
    this.showHeaderPreview_();
    return true;
  }

  showPage(n) {
    if (n < 0 || n >= this.currentBook_.getNumberOfPages() || n == this.currentPageNum_) {
      return;
    }
    this.currentPageNum_ = n;
    this.updatePage();
    this.showHeaderPreview_();
  }

  // TODO: Rework the math in here, it's funky, particularly when no book is set.
  setProgressMeter(pct, opt_label) {
    const totalPages = this.currentBook_ ? this.currentBook_.getNumberOfPages() : 0;
    const numPagesReady = this.currentBook_ ? this.currentBook_.getNumberOfPagesReady() : 0;

    pct = (pct*100);
    if (isNaN(pct)) pct = 1;
    const part = 1 / totalPages;
    const remain = ((pct - this.lastCompletion_)/100)/part;
    const fract = Math.min(1, remain);
    let smartpct = ((numPagesReady / totalPages) + fract * part )* 100;
    if (totalPages == 0) smartpct = pct;

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

    let labelText = pct.toFixed(2) + '% ' + numPagesReady + '/' + totalPages + '';
    if (opt_label) {
      labelText = opt_label + ' ' + labelText;
    }
    title.appendChild(document.createTextNode(labelText));

    getElem('meter2').setAttribute('width',
        100 * (totalPages == 0 ? 0 : ((this.currentPageNum_ + 1) / totalPages)) + '%');

    title = getElem('page');
    while (title.firstChild) title.removeChild(title.firstChild);
    title.appendChild(document.createTextNode((this.currentPageNum_ + 1) + '/' + totalPages));

    if (pct > 0) {
      getElem('nav').className = '';
      getElem('progress').className = '';
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
        const imageFilename = page.imageFile.filename;
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
          const fileSize = (page.imageFile.data.fileData.length);
          if (fileSize < 10*1024) {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.onload = () => {
              getElem('mainText').style.display = '';
              getElem('mainText').innerText = xhr.responseText;
            };
            xhr.send(null);
          } else {
            ctx.fillText('Cannot display this type of file', 100, 200);
          }
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
