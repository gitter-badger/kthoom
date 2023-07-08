/**
 * This file provides types for web app code wanting to orchestrate kthoom. It consists
 * of messages you can send to and receive from the Kthoom window.
 */

/** @enum */
export const EventTypes = {
  LOAD_BOOKS: 'KthoomLoadBooks',
}

/**
 * @typedef BookFetchSpec A structure to hold book creation data via fetch.
 * @property {string} [body] The HTTP request body. Optional.
 * @property {string} method The HTTP request method. Required. Valid values are 'GET' and 'POST'.
 * @property {string} [name] The name of the book. Optional. If not present, the url is used.
 * @property {string} url The URL of the book for fetching. Required.
 */

/**
 * @typedef LoadBooksEvent The Kthoom app interface.
 * @property {string} type Must be set to EventTypes.LOAD_BOOKS.
 * @property {Array<BookFetchSpec>} bookFetchSpecs
 */
