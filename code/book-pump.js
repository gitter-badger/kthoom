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
 * that a Book can subscribe to for creation/loading.
 */
export class BookPump extends EventTarget {
  constructor() { super(); }

  /**
   * @param {ArrayBuffer} ab
   * @param {number} totalExpectedSize
   */
  onData(ab, totalExpectedSize) {
    const evt = new BookPumpEvent(BookPumpEventType.BOOKPUMP_DATA_RECEIVED);
    evt.ab = ab;
    evt.totalExpectedSize = totalExpectedSize;
    this.dispatchEvent(evt);
  }

  onError(err) {
    const evt = new BookPumpEvent(BookPumpEventType.BOOKPUMP_ERROR);
    evt.err = err;
    this.dispatchEvent(evt);
  }

  onEnd() { this.notify(new BookPumpEvent(BookPumpEventType.BOOKPUMP_END)); }
}
