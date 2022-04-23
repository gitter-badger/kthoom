/**
 * A thing that sets up page containers in the UI.
 */

/** @typedef {import('../book-viewer-types.js').Box} Box */
/** @typedef {import('../book-viewer-types.js').PageLayoutParams} PageLayoutParams */
/** @typedef {import('../book-viewer-types.js').PageSetting} PageSetting */

// TODO: topw and toph need to be returned from updateLayout() as well.

/**
 * The job of a PageSetter is to tell the BookViewer how many pages to render and their
 * dimensions. Override the updateLayout() method.
 * @abstract
 */
export class PageSetter {
  /**
   * The job of this function is to lay out the dimensions of all the page boxes that the
   * BookViewer needs to render. It returns an array of page container frames that the
   * BookViewer will fill.
   * @abstract
   * @param {PageLayoutParams} layoutParams
   * @param {Box} bv The BookViewer bounding box.
   * @returns {PageSetting} A set of Page bounding boxes.
   */
  updateLayout(layoutParams, bv) {
    throw 'Unimplemented PageSetter error!';
  }
}
