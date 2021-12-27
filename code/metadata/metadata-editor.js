import { Book } from '../book.js';
import { BookMetadata } from './book-metadata.js';
import { getElem } from '../common/helpers.js';

// TODO: Attach event listeners when the text field contents changes to update metadata.
// TODO: Attach event listeners when the option key changes to update metadata.
// TODO: Style the form fields appropriately.
// TODO: Handle if two rows get the same key.
// TODO: Add a button to remove a row.
// TODO: Add a save button that becomes visible if the editorMetadata differs.
// TODO: When close is clicked and there have been changes, ask user if they want to abandon.
// TODO: If save is clicked, ask to get save handle access.
// TODO: When save handle is obtained, do a zip (optimized for streaming).
// TODO: Once zip is done, save to file system.

/**
 */
export class MetadataEditor {
  /**
   * @param {Book} book 
   */
  constructor(book) {
    /**
     * @private
     * @type {Book}
     */
    this.book_ = book;

    /**
     * This is the editor's copy of the metadata.
     * @private
     * @type {BookMetadata}
     */
    this.editorMetadata_ = book.getMetadata().clone();

    /**
     * @private
     * @type {HTMLDivElement}
     */
    this.contentDiv_ = getElem('metadataTrayContents');

    this.rerender_();
  }

  /** @private */
  rerender_() {
    const tableTemplate = getElem('metadataTable');
    const metadataContents = document.importNode(tableTemplate.content, true);
    const tableElem = metadataContents.querySelector('table.metadataTable');
    for (const [key, value] of this.editorMetadata_.propertyEntries()) {
      if (key && value) {
        let keyCellContent = `<td>
          <select id="property-select">
            <option value="${key}">${key}</option>`;
        for (const otherKey of this.editorMetadata_.getAllowedPropertyKeys()) {
          if (key === otherKey) continue;
          keyCellContent += `<option value="${otherKey}">${otherKey}</option>`;
        }
        keyCellContent += `</select>
          </td>
          <td>
            <input id="property-value" type="text" value="${value}">
          </td>`;

        const rowElem = document.createElement('tr');
        rowElem.innerHTML = keyCellContent;
        tableElem.append(rowElem);
      }
    }

    this.contentDiv_.innerHTML = '';
    this.contentDiv_.appendChild(tableElem);
  }
}
