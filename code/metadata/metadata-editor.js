import { Book } from '../book.js';
import { BookMetadata } from './book-metadata.js';
import { getElem } from '../common/helpers.js';

// TODO: Style the form fields appropriately.
// TODO: Add a button to remove a row.
// TODO: Add a save button that becomes visible if the editorMetadata differs.
// TODO: When close is clicked and there have been changes, ask user if they want to abandon.
// TODO: If save is clicked, ask to get save handle access.
// TODO: When save handle is obtained, do a zip (optimized for streaming).
// TODO: Once zip is done, save to file system.

/**
 * @typedef MetadataRow
 * @property {HTMLSelectElement} select
 * @property {HTMLInputElement} input
 */

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

    /**
     * @private
     * @type {MetadataRow[]}
     */
    this.rows_ = [];

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
          <select id="property-select" data-key="${key}">
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

        this.rows_.push({
          select: rowElem.querySelector('select'),
          input: rowElem.querySelector('input'),
        });
        tableElem.append(rowElem);
      }
    }

    for (const row of this.rows_) {
      row.input.addEventListener('change', evt => {
        this.editorMetadata_.setProperty(key, evt.target.value);
      });
      row.select.addEventListener('change', evt => {
        const select = evt.target;
        const oldKey = select.dataset['key'];
        const newKey = select.value;
        if (newKey !== oldKey) {
          this.editorMetadata_.removeProperty(oldKey);
          this.editorMetadata_.setProperty(newKey, row.input.value);
          select.dataset['key'] = newKey;
        }
        this.setupRows_();
      });
    }

    this.setupRows_();

    this.contentDiv_.innerHTML = '';
    this.contentDiv_.appendChild(tableElem);
  }

  /**
   * Update row options, disabling options that are already used.
   * @private
   */
  setupRows_() {
    const selectedValues = this.rows_.map(row => row.select.value);
    for (const row of this.rows_) {
      for (const optionEl of row.select.querySelectorAll('option')) {
        const optVal = optionEl.value;
        optionEl.disabled = selectedValues.includes(optVal) && optVal !== row.select.value;
      }
    }    
  }
}
