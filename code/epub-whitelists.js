/**
 * epub-whitelists.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2019 Google Inc.
 */

export const ELEMENT_WHITELIST = [
  'body', 'div', 'head', 'img', 'p', 'style', 'title',
];

export const ATTRIBUTE_WHITELIST = {
  'body': [],
  'div': [],
  'head': [],
  'img': ['alt', 'src'],
  'p': [],
};

export const BLOB_URL_ATTRIBUTES = {
  'img': ['src'],
}
