/**
 * epub-whitelists.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2019 Google Inc.
 */

export const ELEMENT_WHITELIST = [
  'body', 'br', 'div', 'head', 'hr', 'img', 'link', 'p', 'span', 'style', 'title',
];

export const ATTRIBUTE_WHITELIST = {
  'body': ['class', 'id'],
  'br': ['class', 'id'],
  'div': ['class', 'id'],
  'hr': ['class', 'id'],
  'img': ['alt', 'class', 'id', 'src'],
  'link': ['href', 'rel', 'type'],
  'p': ['class', 'id'],
  'span': ['class', 'id'],
};

export const BLOB_URL_ATTRIBUTES = {
  'img': ['src'],
}
