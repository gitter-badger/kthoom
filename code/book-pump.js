/**
 * book-pump.js
 * Licensed under the MIT License
 * Copyright(c) 2020 Google Inc.
 */

/**
 * @type {Object<String, String>}
 * @enum
 */
export const BookPumpEventType = {
  BOOKPUMP_DATA_RECEIVED: 'BOOKPUMP_DATA_RECEIVED',
  BOOKPUMP_END: 'BOOKPUMP_END',
  BOOKPUMP_ERROR: 'BOOKPUMP_ERROR',
};

class BookPumpEvent extends Event {
  constructor(type) { super(type); }
}

/**
 * This is a simple class that receives book data from an outside source and then emits Events
 * that a Book can subscribe to for creation/loading. Use this when you are receiving data and
 * need fine control over how the data is "pumped" to kthoom. A good example is when you are
 * streaming book bytes from a Cloud API and want to send each chunk on to kthoom as you get it.
 */
export class BookPump extends EventTarget {
  constructor() { super(); }

  /**
   * Call this method when you are ready to send the next set of book data (bytes) to kthoom.
   * This method must be called in the correct order that the bytes should be concatenated.
   * @param {ArrayBuffer} ab
   * @param {number} totalExpectedSize
   */
  onData(ab, totalExpectedSize) {
    const evt = new BookPumpEvent(BookPumpEventType.BOOKPUMP_DATA_RECEIVED);
    evt.ab = ab;
    evt.totalExpectedSize = totalExpectedSize;
    this.dispatchEvent(evt);
  }

  /** Call this if you have encountered an error. */
  onError(err) {
    const evt = new BookPumpEvent(BookPumpEventType.BOOKPUMP_ERROR);
    evt.err = err;
    this.dispatchEvent(evt);
  }

  /** Call this method when you have received all the bytes for a book. */
  onEnd() { this.notify(new BookPumpEvent(BookPumpEventType.BOOKPUMP_END)); }
}
