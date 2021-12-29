import { Book } from '../book.js';
import { BookMetadata } from './book-metadata.js';
import { Key, assert, getElem } from '../common/helpers.js';

// TODO: When save handle is obtained, do a zip (optimized for streaming).
// TODO: Once zip is done, save to file system.
// TODO: Style the form fields appropriately.

/**
 * @typedef MetadataRow An easy way to get access to row elements in the DOM.
 * @property {HTMLSelectElement} select
 * @property {HTMLInputElement} input
 * @property {HTMLButtonElement} deleteRowButton
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

    getElem('addRowMetadataButton').addEventListener('click', evt => { this.doAddRow_(); })

    this.rerender_();
  }

  /** @returns {boolean} True if the editor is allowed to close. */
  doClose() {
    // If the metadata is edited, confirm the user wants to abandon changes before allowing closing.
    let allowClose = true;
    if (!this.editorMetadata_.equals(this.book_.getMetadata())) {
      allowClose = confirm(`Abandon metadata changes?`)
    }

    // If we are allowed to close, abandon all metadata changes and update UI.
    if (allowClose) {
      this.editorMetadata_ = this.book_.getMetadata().clone();
      this.rerender_();
      // Rendering the editor can show the Add Row button, and we are closing, so hide it.
      getElem('addRowMetadataButton').style.display = 'none';
    }
    return allowClose;
  }

  /**
   * @param {KeyboardEvent} evt
   * @return {boolean} True if the event was handled.
   */
  handleKeyEvent(evt) {
    switch (evt.keyCode) {
      case Key.R: this.doAddRow_(); break;
      case Key.S: this.doSave_(); break;
      case Key.T: this.doClose(); break;
    }

    return true;
  }

  /** @private */
  doAddRow_() {
    const allowedKeys = this.editorMetadata_.getAllowedPropertyKeys();
    const currentKeys = this.rows_.map(row => row.select.dataset['key']);
    let nextKey;
    for (const key of allowedKeys) {
      if (!currentKeys.includes(key)) {
        nextKey = key;
        break;
      }
    }

    if (nextKey) {
      this.editorMetadata_.setProperty(nextKey, '');
      this.rerender_();
    }
  }

  /**
   * @private
   * @param {number} i The row #.
   */
   doDeleteRow_(i) {
    /** @type {MetadataRow} */
    const deletedRow = this.rows_[i];
    const rowEl = deletedRow.select.parentElement.parentElement;
    assert(rowEl instanceof HTMLTableRowElement, `deleteRow_() did not resolve the <tr> properly`);

    const key = deletedRow.select.dataset['key'];
    assert(!!key, `The select element on the row did not have a data-key property`);

    this.editorMetadata_.removeProperty(key);
    this.rerender_();
  }

  /** @private */
  async doSave_() {
    let fileHandle = this.book_.getFileSystemHandle();
    if (!fileHandle) {
      // Ask the user where to save. Only allow saving as cbz.
      fileHandle = await window['showSaveFilePicker']({
        types: [
          {
            description: 'Comic Book Archive files',
            accept: {
              'application/vnd.comicbook+zip': ['.cbz'],
            },
          },
        ],
      });

      // TODO: Something with the file system handle.
    }
  }

  /** @private */
  rerender_() {
    this.rows_ = [];
    const tableTemplate = getElem('metadataTable');
    const metadataContents = document.importNode(tableTemplate.content, true);
    const tableElem = metadataContents.querySelector('table.metadataTable');
    for (const [key, value] of this.editorMetadata_.propertyEntries()) {
      if (key) {
        let rowContent = `<td>
          <select id="property-select" data-key="${key}">
            <option value="${key}">${key}</option>`;
        for (const otherKey of this.editorMetadata_.getAllowedPropertyKeys()) {
          if (key === otherKey) continue;
          rowContent += `<option value="${otherKey}">${otherKey}</option>`;
        }
        rowContent += `</select>
          </td>
          <td>
            <input id="property-value" type="text" data-key="${key}" value="${value}">
          </td>
          <td>
            <button id="deleteRowButton">x</button>
          </td>`;

        const rowElem = document.createElement('tr');
        rowElem.innerHTML = rowContent;

        this.rows_.push({
          select: rowElem.querySelector('select'),
          input: rowElem.querySelector('input'),
          deleteRowButton: rowElem.querySelector('#deleteRowButton'),
        });
        tableElem.append(rowElem);
      }
    }

    for (let i = 0, L = this.rows_.length; i < L; ++i) {
      const row = this.rows_[i];
      row.input.addEventListener('change', evt => {
        this.editorMetadata_.setProperty(evt.target.dataset['key'], evt.target.value);
        this.updateUI_();
      });
      row.input.addEventListener('keydown', evt => { evt.stopPropagation(); });
      row.select.addEventListener('change', evt => {
        const select = evt.target;
        const oldKey = select.dataset['key'];
        const newKey = select.value;
        if (newKey !== oldKey) {
          this.editorMetadata_.removeProperty(oldKey);
          this.editorMetadata_.setProperty(newKey, row.input.value);
          select.dataset['key'] = newKey;
        }
        this.updateUI_();
      });
      row.deleteRowButton.addEventListener('click', evt => { this.doDeleteRow_(i); });
    }

    this.updateUI_();

    this.contentDiv_.innerHTML = '';
    this.contentDiv_.appendChild(tableElem);
  }

  /**
   * Update editor UI after some event. For example, it disables key options in rows and may show
   * the Save button.
   * @private
   */
  updateUI_() {
    const selectedValues = this.rows_.map(row => row.select.value);
    for (const row of this.rows_) {
      for (const optionEl of row.select.querySelectorAll('option')) {
        const optVal = optionEl.value;
        optionEl.disabled = selectedValues.includes(optVal) && optVal !== row.select.value;
      }
    }
    getElem('saveMetadataButton').style.display =
        this.editorMetadata_.equals(this.book_.getMetadata()) ? 'none' : '';
    const allowedKeys = this.editorMetadata_.getAllowedPropertyKeys();
    const currentKeys = this.rows_.map(row => row.select.dataset['key']);
    getElem('addRowMetadataButton').style.display =
        allowedKeys.length > currentKeys.length ? '' : 'none';
  }
}
