import { getElem } from './helpers.js';

export class MetadataViewer {
  constructor() {}

  /** @returns {boolean} */
  isOpen() {
    return getElem('metadataViewer').classList.contains('opened');
  }

  toggleOpen() {
    getElem('metadataViewer').classList.toggle('opened');
  }
}