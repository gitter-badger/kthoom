/**
 * helpers.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

export const Key = {
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

export const getElem = function(id) {
  return document.body.querySelector('#' + id);
};

export const createURLFromArray = function(array, mimeType) {
  const offset = array.byteOffset;
  const len = array.byteLength;
  let blob = new Blob([array], {type: mimeType}).slice(offset, offset + len, mimeType);
  return URL.createObjectURL(blob);
};
