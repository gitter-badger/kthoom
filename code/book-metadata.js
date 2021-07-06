import { BookType } from "./book-binder.js";

/** @enum */
const ComicBookMetadataType = {
  UNKNOWN: 0,
  COMIC_RACK: 1,
};

/**
 * ComicRack:
 * - Series, querySelector('Series').textContent
 * - Volume, querySelector('Volume').textContent
 * - Number, querySelector('Number').textContent
 * - Publisher, querySelector('Publisher').textContent
 * - Year, querySelector('Year').textContent
 */

/**
 * A lightweight class to encapsulate metadata of a book. This will
 * hide the differences between metadata formats from kthoom.
 */
export class BookMetadata {
  /**
   * @param {Document} metadataDoc The XML document of the metadata.
   * @param {BookType} bookType The type of the book.
   */
  constructor(metadataDoc, bookType) {
    /** @private {Document} */
    this.metadataDoc_ = metadataDoc;

    /** @private {BookType} */
    this.bookType_ = bookType;
  }

  /** @returns {boolean} True if any metadata property is found. */
  isPopulated() {
    return this.propertyEntries().map((kv) => kv[1]).some(val => !!val);
  }

  /** @returns {Array<Array<>>} A list of key-value pairs, similar to Object.entries(). */
  propertyEntries() {
    if (this.bookType_ === BookType.COMIC) {
      return [
        ['Publisher', this.publisher],
        ['Series', this.series],
        ['Volume', this.volume],
        ['Number', this.number],
        ['Year', this.year],
      ];
    }
    return [];
  }

  /** @returns {string} */
  get series() {
    return this.metadataDoc_?.querySelector('Series')?.textContent;
  }

  /** @returns {string} */
  get volume() {
    return this.metadataDoc_?.querySelector('Volume')?.textContent;
  }

  /** @returns {string} */
  get number() {
    return this.metadataDoc_?.querySelector('Number')?.textContent;
  }

  /** @returns {string} */
  get publisher() {
    return this.metadataDoc_?.querySelector('Publisher')?.textContent;
  }

  /** @returns {Number} */
  get year() {
    return parseInt(this.metadataDoc_?.querySelector('Year')?.textContent, 10);
  }
}
