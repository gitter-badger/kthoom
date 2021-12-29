import { BookType } from "../book-binder.js";

const STREAM_OPTIMIZED_NS = 'http://www.codedread.com/sop';

/** @enum */
export const ComicBookMetadataType = {
  UNKNOWN: 0,
  COMIC_RACK: 1,
};

/**
 * ComicRack. Let's start with these five fields:
 * - Series, querySelector('Series').textContent
 * - Volume, querySelector('Volume').textContent
 * - Number, querySelector('Number').textContent
 * - Publisher, querySelector('Publisher').textContent
 * - Year, querySelector('Year').textContent
 */
const COMICRACK_KEYS = ['Series', 'Volume', 'Number', 'Publisher', 'Year'];

/**
 * A lightweight class to encapsulate metadata of a book. This will
 * hide the differences between metadata formats from kthoom.
 */
export class BookMetadata {
  /**
   * @param {BookType} bookType The type of the book.
   * @param {Iterable<string, string>} tagMap The key-value metadata tags.
   * @param {boolean} optimizedForStreaming Whether this book is optimized for streaming, meaning
   *     files in the archive are in read order.
   */
  constructor(bookType, tagMap = new Map(), optimizedForStreaming = false) {
    /** @private {BookType} */
    this.bookType_ = bookType;

    /** @private {Map<string, string>} */
    this.tags_ = new Map(tagMap);

    /** @private {boolean} */
    this.optimizedForStreaming_ = optimizedForStreaming;
  }

  /** @returns {BookMetadata} */
  clone() {
    return new BookMetadata(this.bookType_, this.tags_, this.optimizedForStreaming_);
  }

  /**
   * @param {BookMetadata} o
   * @returns {boolean} Whether o is equivalent to this metadata object.
   */
  equals(o) {
    if (this.bookType_ !== o.bookType_) {
      return false;
    }
    if (this.optimizedForStreaming_ !== o.isOptimizedForStreaming()) {
      return false;
    }
    const otherEntries = o.propertyEntries();
    if (Array.from(otherEntries).length !== Array.from(this.tags_.keys()).length) {
      return false;
    }
    for (const [key, val] of otherEntries) {
      if (!this.tags_.has(key) || this.tags_.get(key) !== val) {
        return false;
      }
    }
    return true;
  }

  /** @returns {string[]} */
  getAllowedPropertyKeys() {
    if (this.bookType_ === ComicBookMetadataType.COMIC_RACK) {
      return COMICRACK_KEYS;
    }
    return [];
  }

  /** @returns {ComicBookMetadataType} */
  getBookType() {
    return this.bookType_;
  }

  /**
   * @param {string} key
   * @returns {string}
   */
  getProperty(key) {
    return this.tags_.get(key);
  }

  /** @returns {boolean} */
  isOptimizedForStreaming() { return this.optimizedForStreaming_; }

  /** @returns {Iterable<string,string>} A list of key-value pairs, similar to Object.entries(). */
  propertyEntries() {
    return this.tags_.entries();
  }

  /** @param {string} key */
  removeProperty(key) {
    this.tags_.delete(key);
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  setProperty(key, value) {
    this.tags_.set(key, value);
  }
}

/**
 * @param {BookType} bookType Defaults to COMIC.
 * @returns {BookMetadata}
 */
export function createEmptyMetadata(bookType = BookType.COMIC) {
  return new BookMetadata(bookType);
}

/**
 * @param {string} metadataXml The text contents of the ComicInfo.xml file.
 * @returns {BookMetadata}
 */
 export function createMetadataFromComicBookXml(metadataXml) {
  const metadataDoc = new DOMParser().parseFromString(metadataXml, 'text/xml');

  // Figure out if this XML file indicates the archive is optimized for streaming.
  let optimizedForStreaming = false;
  const infoEls = metadataDoc.getElementsByTagNameNS(STREAM_OPTIMIZED_NS,
    'ArchiveFileInfo');
  if (infoEls && infoEls.length > 0) {
    const infoEl = infoEls.item(0);
    if (infoEl.getAttribute('optimizedForStreaming') === 'true') {
      optimizedForStreaming = true;
    }
  }

  // Extract all known key-value pairs.
  const tagMap = new Map();
  for (const key of COMICRACK_KEYS) {
    let val = metadataDoc?.querySelector(key)?.textContent;
    if (val) {
      tagMap.set(key, val);
    }
  }
  
  return new BookMetadata(BookType.COMIC, tagMap, optimizedForStreaming);
}

/**
 * @param {BookMetadata} metadata 
 * @returns {string} The XML text of the metadata for ComicInfo.xml.
 */
export function createComicBookXmlFromMetadata(metadata) {
  let xmlStr = `<ComicInfo>\n`;

  if (metadata.isOptimizedForStreaming()) {
    xmlStr += `  <ArchiveFileInfo xmlns="http://www.codedread.com/sop" optimizedForStreaming="true"></ArchiveFileInfo>\n`;
  }

  for (const [key, val] of this.tagMap.entries()) {
    if (COMICRACK_KEYS.includes(key)) {
      // TODO: Sanitize these values?
      xmlStr += `  <${key}>${val}</${key}>\n`;
    }
  }

  xmlStr += `</ComicInfo>\n`;
  return xmlStr;
}