import { Book } from '../book.js';
import { Key, Params, getElem } from '../common/helpers.js';

export class MetadataViewer {
  constructor() {
    /**
     * @private
     * @type {Book}
     */
    this.book_ = null;

    /** @private {HTMLDivElement} */
    this.contentDiv_ = getElem('metadataTrayContents');

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

  reset() {
    this.book_ = null;
    this.rerender_();
  }

  /** @param {Book} book */
  setBook(book) {
    this.book_ = book;
    this.rerender_();
  }

  /**
   * Opens or closes the metadata viewer pane. Only works if the MetadataViewer has a book.
   */
  toggleOpen() {
    if (!this.book_) {
      return;
    }
    getElem('metadataViewer').classList.toggle('opened');
    getElem('metadataViewerOverlay').classList.toggle('hidden');
  }

  /** @private */
  rerender_() {
    if (this.book_) {
      const metadata = this.book_.getMetadata();
      const metadataContents = document.importNode(this.tableTemplate_.content, true);
      const tableElem = metadataContents.querySelector('table.metadataTable');
      const rowTemplate = getElem('metadataTableRow');
      for (const [key, value] of metadata.propertyEntries()) {
        if (key && value) {
          const rowElem = document.importNode(rowTemplate.content, true);
          rowElem.querySelector('td.metadataPropName').textContent = key;
          rowElem.querySelector('td.metadataPropValue').textContent = value;
          tableElem.appendChild(rowElem);
        }
      }

      if (Params['editMetadata']) {
        const toolbarDiv = getElem('metadataToolbar');
        toolbarDiv.style.display = 'block';

        const editButton = getElem('editMetadataButton');
        // Dynamically load Metadata Editor when the edit button is clicked.
        editButton.addEventListener('click', evt => {
          import('./metadata-editor.js').then(module => {
            const editor = new module.MetadataEditor();
          });
        });
      }
  
      this.contentDiv_.innerHTML = '';
      this.contentDiv_.appendChild(tableElem);
    } else {
      this.contentDiv_.innerHTML = 'No metadata';
    }
  }
}
