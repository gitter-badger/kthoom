/** Defines the most basic page setter of having just a single page. */
import { FitMode } from '../book-viewer-types.js';
import { PageSetter } from './page-setter.js';
import { assert } from '../common/helpers.js';
import { OnePageSetter } from './one-page-setter.js';

/** @typedef {import('../book-viewer-types.js').Box} Box */
/** @typedef {import('../book-viewer-types.js').PageLayoutParams} PageLayoutParams */
/** @typedef {import('../book-viewer-types.js').PageSetting} PageSetting */

// TODO: Add unit tests.

export class LongStripPageSetter extends PageSetter {
  /** @type {num} */
  #numPages = 0;

  /** @type {OnePageSetter} */
  #onePageSetter = new OnePageSetter();

  constructor() {
    super();
  }

  /** @param {number} np */
  // TODO: Remove this special method and pass aspectRatios in as layoutParams below.
  setNumPages(np) {
    this.#numPages = np;
  }

  /**
   * @param {PageLayoutParams} layoutParams
   * @param {Box} bv The BookViewer bounding box.
   * @returns {PageSetting} A set of Page bounding boxes.
   */
  updateLayout(layoutParams) {
    assert(this.#numPages > 0, `LongStripPageSetter.updateLayout() has #numPages=${this.#numPages}`);
    const portraitMode = (layoutParams.rotateTimes % 2 === 0);

    // Use the OnePageSetter to get the dimensions of the first page.
    // /** @type {PageSetting} */
    const pageSetting = this.#onePageSetter.updateLayout(layoutParams);
    // And then use that to size the remaining PageSetting boxes, being careful to update the
    // book viewer dimensions as appropriate to the rotation.
    for (let i = 1; i < this.#numPages; ++i) {
      const prevBox = pageSetting.boxes[i - 1];
      pageSetting.boxes.push({
        left: prevBox.left,
        top: prevBox.top + prevBox.height,
        width: prevBox.width,
        height: prevBox.height,
      });

      if (portraitMode) {
        pageSetting.bv.height += prevBox.height;
        if (layoutParams.rotateTimes === 2) { // 180 deg.
          pageSetting.bv.top -= prevBox.height;
        }
      } else {
        pageSetting.bv.width += prevBox.height;
        if (layoutParams.rotateTimes === 1) { // counter-clockwise.
          pageSetting.bv.left -= prevBox.height;
        }
      }
    }
    return pageSetting;
  }
}
