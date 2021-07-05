import { BookMetadata } from './book-metadata.js';
import { getElem } from './helpers.js';

export class MetadataViewer {
  constructor() {
    /** @private {BookMetadata} */
    this.metadata_ = null;
  }

  /** @returns {boolean} */
  isOpen() {
    return getElem('metadataViewer').classList.contains('opened');
  }

  toggleOpen() {
    getElem('metadataViewer').classList.toggle('opened');
  }

  /** @param {BookMetadata} metadata */
  setMetadata(metadata) {
    this.metadata_ = metadata;

    if (!this.metadata_) {
      return;
    }

    // TODO: Re-render.
  }
}