import { BookMetadata } from './book-metadata.js';
import { Key, Params, getElem } from '../common/helpers.js';

export class MetadataViewer {
  constructor() {
    /** @private {BookMetadata} */
    this.metadata_ = null;

    /** @private {HTMLDivElement} */
    this.contentDiv_ = getElem('metadataViewerContents');

    if (Params['editMetadata']) {
      const toolbarDiv = getElem('metadataToolbar');
      toolbarDiv.style.display = 'block';
    }

    /** @private {HTMLTemplateElement} */
    this.tableTemplate_ = getElem('metadataTable');

    getElem('metadataViewerButton').addEventListener('click', () => this.toggleOpen());
    getElem('metadataViewerOverlay').addEventListener('click', (e) => this.toggleOpen());
  }

  /**
   * @param {KeyboardEvent} evt
   * @return {boolean} True if the event was handled.
   */
  handleKeyEvent(evt) {
    if (!this.isOpen()) {
      return false;
    }
    const code = evt.keyCode;
    if (code === Key.ESCAPE) {
      this.toggleOpen();
    }
    return true;
  }

  /** @returns {boolean} */
  isOpen() {
    return getElem('metadataViewer').classList.contains('opened');
  }

  toggleOpen() {
    getElem('metadataViewer').classList.toggle('opened');
    getElem('metadataViewerOverlay').classList.toggle('hidden');
  }

  reset() {
    this.metadata_ = null;
    this.rerender_();
  }

  /** @param {BookMetadata} metadata */
  setMetadata(metadata) {
    this.metadata_ = metadata;

    if (!this.metadata_) {
      return;
    }

    this.rerender_();
  }

  /** @private */
  rerender_() {
    if (this.metadata_) {
      const metadataContents = document.importNode(this.tableTemplate_.content, true);
      const tableElem = metadataContents.querySelector('table.metadataTable');
      const rowTemplate = getElem('metadataTableRow');
      for (const [key, value] of this.metadata_.propertyEntries()) {
        if (key && value) {
          const rowElem = document.importNode(rowTemplate.content, true);
          rowElem.querySelector('td.metadataPropName').textContent = key;
          rowElem.querySelector('td.metadataPropValue').textContent = value;
          tableElem.appendChild(rowElem);
        }
      }

      this.contentDiv_.innerHTML = '';
      this.contentDiv_.appendChild(tableElem);
    } else {
      this.contentDiv_.innerHTML = 'No metadata';
    }
  }
}
