/**
 * book-events.js
 * Licensed under the MIT License
 * Copyright(c) 2019 Google Inc.
 */

/**
 * @type {Object<String, String>}
 * @enum
 */
export const BookEventType = {
  UNKNOWN: 'BOOK_EVENT_UNKNOWN',
  BINDING_COMPLETE: 'BOOK_EVENT_BINDING_COMPLETE',
  LOADING_STARTED: 'BOOK_EVENT_LOADING_STARTED',
  LOADING_COMPLETE: 'BOOK_EVENT_LOADING_COMPLETE',
  METADATA_XML_EXTRACTED: 'BOOK_EVENT_METADATA_XML_EXTRACTED',
  PAGE_EXTRACTED: 'BOOK_EVENT_PAGE_EXTRACTED',
  PROGRESS: 'BOOK_EVENT_PROGRESS',
  UNARCHIVE_COMPLETE: 'BOOK_EVENT_UNARCHIVE_COMPLETE',
};

/**
 * The source can be a BookBinder or a Book.
 * @type {{
 *   source: Object,
 *   type: string,
 * }}
 */
export class BookEvent {
  constructor(source) {
    this.source = source;
    this.type = BookEventType.UNKNOWN;
  }
}

export class BookLoadingStartedEvent extends BookEvent {
  constructor(source) {
    super(source);
    this.type = BookEventType.LOADING_STARTED;
  }
}

export class BookLoadingCompleteEvent extends BookEvent {
  constructor(source) {
    super(source);
    this.type = BookEventType.LOADING_COMPLETE;
  }
}

export class BookMetadataXmlExtractedEvent extends BookEvent {
  constructor(source, metadataDoc) {
    super(source);
    this.type = BookEventType.METADATA_XML_EXTRACTED;
    this.metadataDoc = metadataDoc;
  }
}

export class BookPageExtractedEvent extends BookEvent {
  constructor(source, page, pageNum) {
    super(source);
    this.type = BookEventType.PAGE_EXTRACTED;
    this.page = page;
    this.pageNum = pageNum;
  }
}

export class BookProgressEvent extends BookEvent {
  constructor(source, totalPages = undefined, message = undefined) {
    super(source);
    this.type = BookEventType.PROGRESS;
    this.totalPages = totalPages;
    this.message = message;
  }
}

export class BookBindingCompleteEvent extends BookEvent {
  constructor(source) {
    super(source);
    this.type = BookEventType.BINDING_COMPLETE;
  }
}
