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
 */
export class BookEvent extends Event {
  constructor(source, type = BookEventType.UNKNOWN) {
    super(type);
    /** @type {Book|BookBinder} */
    this.source = source;
  }
}

export class BookLoadingStartedEvent extends BookEvent {
  constructor(source) {
    super(source, BookEventType.LOADING_STARTED);
  }
}

export class BookLoadingCompleteEvent extends BookEvent {
  constructor(source) {
    super(source, BookEventType.LOADING_COMPLETE);
  }
}

export class BookMetadataXmlExtractedEvent extends BookEvent {
  constructor(source, bookMetadata) {
    super(source, BookEventType.METADATA_XML_EXTRACTED);
    this.bookMetadata = bookMetadata;
  }
}

export class BookPageExtractedEvent extends BookEvent {
  constructor(source, page, pageNum) {
    super(source, BookEventType.PAGE_EXTRACTED);
    this.page = page;
    this.pageNum = pageNum;
  }
}

export class BookProgressEvent extends BookEvent {
  constructor(source, totalPages = undefined, message = undefined) {
    super(source, BookEventType.PROGRESS);
    this.totalPages = totalPages;
    this.message = message;
  }
}

export class BookBindingCompleteEvent extends BookEvent {
  constructor(source) {
    super(source, BookEventType.BINDING_COMPLETE);
  }
}
