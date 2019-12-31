/**
 * epub-book-binder.js
 * Licensed under the MIT License
 * Copyright(c) 2019 Google Inc.
 */

import { BookBinder } from './book-binder.js';
import { BookBindingCompleteEvent, BookPageExtractedEvent, BookProgressEvent } from './book-events.js';
import { TextPage } from './page.js';

const CONTAINER_FILE = 'META-INF/container.xml';
const CONTAINER_NAMESPACE = 'urn:oasis:names:tc:opendocument:xmlns:container';
const EPUB_MIMETYPE = 'application/epub+zip';
const OPF_NAMESPACE = 'http://www.idpf.org/2007/opf';
const XHTML_MIMETYPE = 'application/xhtml+xml';

class FileRef {
  /**
   * @param {string} href 
   * @param {string} mediaType 
   * @param {Uint8Array} data 
   */
  constructor(href, mediaType, data) {
    /** @type {string} */
    this.href = href;
    /** @type {string} */
    this.mediaType = mediaType;
    /** @type {Uint8Array} */
    this.data = data;
  }
}

/**
 * The BookBinder for EPUB files.  Do not use, since this is a WIP.
 */
export class EPUBBookBinder extends BookBinder {
  constructor(filenameOrUri, ab, totalExpectedSize) {
    super(filenameOrUri, ab, totalExpectedSize);

    /**
     * A map of all files in the archive, keyed by its full path in the archive.
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
    for (const spref of this.spineRefs_) {
      const {mediaType, data} = spref;
      if (mediaType === XHTML_MIMETYPE) {
        const htmlDoc = new DOMParser().parseFromString(toText(data), XHTML_MIMETYPE);
        monsterText += htmlDoc.documentElement.textContent;
      }
    }

    // TODO(epub): Get rid of the need to send a fake file to create a page.
    const fakeFile = {filename: 'dummy-file'};
    const onePager = new TextPage(fakeFile, monsterText);
    this.notify(new BookProgressEvent(
      this,
      undefined /* loadingPct */,
      undefined /* unarchivingPct */,
      1));
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
      this.manifestFileMap_.set(id, new FileRef(filename, mediaType, this.fileMap_.get(filename)));
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
function toText(bytes) {
  const num = bytes.byteLength;
  let result = new Array(num);
  for (let i = 0; i < num; ++i) {
    result[i] = String.fromCharCode(bytes[i]);
  }
  return result.join('');
}