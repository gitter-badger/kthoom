/** Defines the most basic page setter of having just a single page. */
import { FitMode } from '../book-viewer-types.js';
import { PageSetter } from './page-setter.js';

/** @typedef {import('../book-viewer-types.js').Box} Box */
/** @typedef {import('../book-viewer-types.js').PageLayoutParams} PageLayoutParams */
/** @typedef {import('../book-viewer-types.js').PageSetting} PageSetting */

// TODO: Add unit tests.

export class LongStripPageSetter extends PageSetter {
  /**
   * @param {PageLayoutParams} layoutParams
   * @param {Box} bv The BookViewer bounding box.
   * @returns {PageSetting} A set of Page bounding boxes.
   */
  updateLayout(layoutParams) {
    const par = layoutParams.pageAspectRatio;
    const portraitMode = (layoutParams.rotateTimes % 2 === 0);
    const bv = layoutParams.bv;
    const bvar = bv.width / bv.height;

    // This is the center of rotation, always rotating around the center of the book viewer.
    const rotx = bv.left + bv.width / 2;
    const roty = bv.top + bv.height / 2;

    // TODO: Write this.

    return null;
  }
}
