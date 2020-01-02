/**
 * epub-book-binder.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2019 Google Inc.
 */

 /**
  * Notes:
  *
  * - create an HTML target doc
  * - have a "cursor" that remembers where we are in parsing the spine (which itemref, which element)
  * - for each XHTML spine itemref:
  *   - create a unique id
  *   - create a top-level div element in HTML target doc
  *   - do node DFT, if each element type matches whitelist, create one in target doc
  *     - (if not, then use div?)
  *   - for each attribute in the whitelist, create one in target doc
  *   - some elements (img) might have src/href, if so, then create a Blob URL for that reference and
  *     update the attribute to be the blob URL
  * - Add elements until the page is too long... remove the last node.
  * - put the target doc into a HtmlPage and emit a PageExtracted event
  *
  * - use flex-direction=row and treat each column as a "page" in kthoom.  Fixed height and flows
  *   between columns naturally?
  */

import { BookBinder } from './book-binder.js';
import { BookBindingCompleteEvent, BookPageExtractedEvent, BookProgressEvent } from './book-events.js';
import { TextPage } from './page.js';

const CONTAINER_FILE = 'META-INF/container.xml';
const CONTAINER_NAMESPACE = 'urn:oasis:names:tc:opendocument:xmlns:container';
const EPUB_MIMETYPE = 'application/epub+zip';
const OPF_NAMESPACE = 'http://www.idpf.org/2007/opf';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XHTML_MIMETYPE = 'application/xhtml+xml';

class FileRef {
  /**
   * @param {string} id
   * @param {string} href
   * @param {string} mediaType
   * @param {Uint8Array} data
   */
  constructor(id, href, mediaType, data) {
    /** @type {string} */
    this.id = id;

    /** @type {string} */
    this.href = href;

    /** @type {string} */
    this.mediaType = mediaType;

    /** @type {Uint8Array} */
    this.data = data;

    /** @private {Blob} */
    this.blob_ = undefined;

    /** @private {string} */
    this.blobURL_ = undefined;
  }

  getBlob() {
    if (!this.blob) this.initializeBlob_();
    return this.blob;
  }

  getBlobURL() {
    if (!this.blobURL) this.initializeBlob_();
    return this.blobURL;
  }

  /** @private */
  initializeBlob_() {
    this.blob = new Blob(data, {type: mediaType});
    this.blobURL = URL.createObjectURL(this.blob);
  }
}

/**
 * The BookBinder for EPUB files.  Do not use, since this is a WIP.
 */
export class EPUBBookBinder extends BookBinder {
  constructor(filenameOrUri, ab, totalExpectedSize) {
    super(filenameOrUri, ab, totalExpectedSize);

    /**
     * A map of all files in the archive, keyed by its full path in the archive with the value
     * being the raw ArrayBuffer.
     * @private {Map<string, Uint8Array>}
     */
    this.fileMap_ = new Map();

    /** @private {string} */
    this.opfFilename_ = undefined;

    /**
     * Maps the id of each manifest item to its file reference.
     * @private {Map<string, FileRef>}
     */
    this.manifestFileMap_ = new Map();

    /**
     * The ordered list of reading items.
     * @private {Array<FileRef>}
     */
    this.spineRefs_ = [];
  }

  /** @override */
  beforeStart_() {
    let firstFile = true;
    this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.EXTRACT, evt => {
      const theFile = evt.unarchivedFile;
      this.fileMap_.set(theFile.filename, theFile.fileData);

      // The first file must be 'mimetype'.
      if (firstFile) {
        firstFile = false;
        this.validateMimetype_(theFile);
      }
    });
    this.unarchiver_.addEventListener(bitjs.archive.UnarchiveEvent.Type.FINISH, evt => {
      this.setUnarchiveComplete();

      this.parseContainer_();
      this.parseOPF_();

      // All files have been archived and spine elements have been cross-referenced.
      this.inflateSpine_();
    });
  }

  // TODO: Proper error handling throughout.

  inflateSpine_() {
    let monsterText = '';
    let xhtmlChunks = [];
    const numSpineRefs = this.spineRefs_.length;
    for (let i = 0; i < numSpineRefs; ++i) {
      const spref = this.spineRefs_[i];
      const {mediaType, data} = spref;
      if (mediaType === XHTML_MIMETYPE) {
        const htmlDoc = new DOMParser().parseFromString(toText(data), XHTML_MIMETYPE);
        xhtmlChunks.push(htmlDoc);
        monsterText += htmlDoc.documentElement.textContent;
      }
      this.layoutPercentage_ = (i+1) / numSpineRefs;
      this.notify(new BookProgressEvent(this, 1));
    }

    /*
    new Promise((resolve, reject) => {
      // TODO: Styling for overflow, color.
      const svgDoc = document.implementation.createDocument(SVG_NAMESPACE, 'svg');
      svgDoc.documentElement.setAttributeNS(null, 'viewBox', '0 0 100 100');
      const styleElem = svgDoc.createElementNS(SVG_NAMESPACE, 'style');
//      styleElem 
      const foreignObject = svgDoc.createElementNS(null, 'foreignObject');
      foreignObject.setAttributeNS(null, 'x', '0');
      foreignObject.setAttributeNS(null, 'y', '0');
      foreignObject.setAttributeNS(null, 'width', '100');
      foreignObject.setAttributeNS(null, 'height', '100');
      svgDoc.documentElement.appendChild(foreignObject);

      debugger;
      // For each HTML chunk, create a foreignObject element.
      for (const xhtmlChunk of xhtmlChunks) {
        const htmlElem = xhtmlChunk.documentElement;
        foreignObject.appendChild(htmlElem);
        svgDoc.documentElement.appendChild(foreignObject);
      }
      const dataURI = 'data:image/svg+xml;utf8,' + new XMLSerializer().serializeToString(svgDoc);
      const img = new Image();
      img.onload = () => { resolve(new ImagePage('page-1', img)); };
      img.onerror = (e) => {
        debugger;
        resolve(new TextPage('bad-page', `Could not open SVG image`));
      };
      img.src = dataURI;
      debugger;
    }).then(page => {
      // Emit all events in the expected order for our single page.
      this.notify(new BookProgressEvent(this, 1));
      this.notify(new BookPageExtractedEvent(this, page, 1));
      this.notify(new BookBindingCompleteEvent(this, [page]));
    });
    */

    const onePager = new TextPage('page-1', monsterText);
    // Emit all events in the expected order for our single page.
    this.notify(new BookProgressEvent(this, 1));
    this.notify(new BookPageExtractedEvent(this, onePager, 1));
    this.notify(new BookBindingCompleteEvent(this, [onePager]));
  }

  /** @private */
  parseContainer_() {
      // META-INF/container.xml must exist.
      assert(this.fileMap_.has(CONTAINER_FILE),
          `The file ${CONTAINER_FILE} did not exist inside the epub archive`);

      const containerXml = toText(this.fileMap_.get(CONTAINER_FILE));
      const parser = new DOMParser();
      const doc = parser.parseFromString(containerXml, 'text/xml');
      assert(!!doc, `Container file did not parse as XML`);
      assert(doc.documentElement.namespaceURI === CONTAINER_NAMESPACE,
          `The root element in the container was not in the correct namespace:
           ${doc.documentElement.namespaceURI}`,
           doc.documentElement);
      assert(doc.documentElement.nodeName === 'container',
          `The root element was not a 'container' element.`,
          doc.documentElement);

      const rootFile = doc.querySelector(
          'container > rootfiles > rootfile[media-type="application/oebps-package+xml"]');
      assert(!!rootFile,
          `Did not find a rootfile with the proper media-type="application/oebps-package+xml"`,
          doc.documentElement);

      this.opfFilename_ = rootFile.getAttribute('full-path');
      assert(!!this.opfFilename_,
          `rootfile did not have a 'full-path' attribute`,
          doc.documentElement);
  }

  /** @private */
  parseOPF_() {
    assert(this.fileMap_.has(this.opfFilename_),
        `EPUB archive file did not have a file named '${this.opfFilename_}`);

    const lastSlash = this.opfFilename_.lastIndexOf('/');
    const rootDir = lastSlash === -1 ? '' : this.opfFilename_.substr(0, lastSlash + 1);

    const opfFile = toText(this.fileMap_.get(this.opfFilename_));

    const doc = new DOMParser().parseFromString(opfFile, 'text/xml');
    assert(!!doc, 'OPF file did not parse as XML') ;
    assert(doc.documentElement.namespaceURI === OPF_NAMESPACE,
        `OPF document was not in the correct namespace: ${doc.documentElement.namespaceURI}`);
    assert(doc.documentElement.nodeName === 'package',
        `The root element was not a 'package' element.`,
        doc.documentElement);
    assert(doc.documentElement.hasAttribute('unique-identifier'),
        `package element did not have a unique-identifier.`,
        doc.documentElement);

    const manifestItems = doc.querySelectorAll('package > manifest > item');
    const numManifestItems = manifestItems.length;
    assert(numManifestItems > 0, `OPF manifest did not have any item elements`);
    for (let i = 0; i < numManifestItems; ++i) {
      const item = manifestItems.item(i);
      const id = item.getAttribute('id');
      const mediaType = item.getAttribute('media-type');
      const href = item.getAttribute('href');
      assert(id && mediaType && href, `Manifest item was missing a required attribute`, item);

      const filename = (rootDir + href);
      assert(this.fileMap_.has(filename), `EPUB archive was missing file: ${filename}`);

      const fileRef = new FileRef(id, filename, mediaType, this.fileMap_.get(filename));
      this.manifestFileMap_.set(id, fileRef);
    }

    const spineItemRefs = doc.querySelectorAll('package > spine > itemref');
    assert(spineItemRefs.length > 0, 'OPF spine did not have any itemref elements');
    for (let i = 0; i < spineItemRefs.length; ++i) {
      const itemRef = spineItemRefs.item(i);
      const idref = itemRef.getAttribute('idref');
      assert(!!idref, `Spine itemref did not have an idref`, itemRef);

      // Skip spine itemref elements that are not part of the linear reading order (for now).
      if (itemRef.getAttribute('linear') === 'no') {
        continue;
      }

      assert(this.manifestFileMap_.has(idref), `Manifest file map missing a spine item: ${idref}`);
      this.spineRefs_.push(this.manifestFileMap_.get(idref));
    }
  }

  /** @private */
  validateMimetype_(theFile) {
    assert(theFile.filename === 'mimetype', `The first file was not named 'mimetype'`);
    const fileText = toText(theFile.fileData);
    assert(fileText === EPUB_MIMETYPE, `The 'mimetype' file had invalid contents: ${fileText}`);
  }
}

function assert(cond, err, optContextObj = undefined) {
  if (!cond) {
    console.error(err);
    if (optContextObj) {
      console.dir(optContextObj);
    }
  }
}

// TODO: Use TextDecoder?
function toText(bytes) {
  const num = bytes.byteLength;
  let result = new Array(num);
  for (let i = 0; i < num; ++i) {
    result[i] = String.fromCharCode(bytes[i]);
  }
  return result.join('');
}
