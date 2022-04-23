/** @enum */
export const FitMode = {
  Width: 1,
  Height: 2,
  Best: 3,
}

/**
 * @typedef Box Defines a box/rectangle.
 * @property {number} left The left edge.
 * @property {number} top The top edge.
 * @property {number} width The width.
 * @property {number} height The height.
 */

/**
 * @typedef PageLayoutParams Configurable parameters for a page layout.
 * @property {number} rotateTimes The number of 90 degree rotations.
 * @property {FitMode} fitMode The fit mode.
 * @property {number} pageAspectRatio The aspect ratio of the first page in the layout.
 * @property {Box} bv The BookViewer bounding box.
 */

/**
 * @typedef PageSetting A description of how pages and the book viewer should be layed out.
 * @property {Box[]} boxes Page bounding boxes.
 * @property {Box} bv The adjusted box for the book viewer.
 */
