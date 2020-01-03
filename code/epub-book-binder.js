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
  * - Using iframe to isolate the CSS styles within the XHTML pages in the book archive.
  * - Upon any DOM node needing a reference to another file (img, etc), then create a Blob URL.
  * - Trick is that every time the page needs rendering, we will need to create a new Blob URL,
  *   because the iframe content doc is destroyed, thereby revoking all Blob URLs.
  * - Have a page-setting phase where we go through all DOM nodes, rendering to a non-displayed
  *   iframe to size things right.  Each page can remember the DOM it needs to show.
  * - Once that phase is done, we can eject the archive files from memory and just keep around the
  *   page objects.
  * - Each page object must be able to re-render itself (and create any Blob URLs it needs).
  */

import { BookBinder } from './book-binder.js';
import { BookBindingCompleteEvent, BookPageExtractedEvent, BookProgressEvent } from './book-events.js';
import { NodeType, walkDom } from './dom-walker.js';
import { ATTRIBUTE_WHITELIST, BLOB_URL_ATTRIBUTES, ELEMENT_WHITELIST} from './epub-whitelists.js';
import { FileRef } from './file-ref.js';
import { TextPage, XhtmlPage } from './page.js';

const ATTR_PREFIX = 'data-kthoom-';
const CONTAINER_FILE = 'META-INF/container.xml';
const CONTAINER_NAMESPACE = 'urn:oasis:names:tc:opendocument:xmlns:container';
const EPUB_MIMETYPE = 'application/epub+zip';
const OPF_NAMESPACE = 'http://www.idpf.org/2007/opf';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XHTML_MIMETYPE = 'application/xhtml+xml';

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

  /**
   * @param {string} href
   * @param {string} rootDir
   * @return {FileRef}
   * @private
   */
  getManifestFileRef_(href, rootDir) {
    // TODO: Do full path resolution here.
    const fullPath = rootDir + href;
    for (const ref of this.manifestFileMap_.values()) {
      if (ref.href === fullPath) {
        return ref;
      }
    }
    return null;
  }

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

    const onePager = new TextPage('page-1', monsterText);
    // Emit all events in the expected order for our single page.
    this.notify(new BookProgressEvent(this, 1));
    this.notify(new BookPageExtractedEvent(this, onePager, 1));

    // Create an iframe element and add it to our document so that the contentWindow is available.
    // We need the contentWindow to ensure the elements and Blob URLs are created in the right
    // HTML context.
    const iframeEl = document.createElement('iframe');
    iframeEl.style.display = 'none';
    document.body.appendChild(iframeEl);
    const contentWindow = iframeEl.contentWindow;
    const htmlDoc = iframeEl.contentDocument;
    const pageEl = htmlDoc.documentElement;

    let outEl = pageEl;
    const nodeCopyMap = {};

    // Process all serialized nodes of XHTML and make sanitized copies in the new DOM context.
    let curNode = xhtmlChunks[0].documentElement;
    nodeCopyMap[curNode] = pageEl;
    walkDom(curNode, curNode => {
      // Ensure that we are in the current place in the copy tree to insert the new element.
      if (nodeCopyMap[curNode.parentElement]) {
        outEl = nodeCopyMap[curNode.parentElement];
      }

      let nodeName = curNode.nodeName;
      // Special handling for text nodes.
      if (nodeName === '#text') {
        outEl.appendChild(curNode.cloneNode());
      } else if (ELEMENT_WHITELIST.includes(nodeName)) {

        let newEl;
        // Special handling for the iframe's head and body elements which are created for us.
        if (nodeName === 'head') {
          newEl = htmlDoc.head;
        } else if (nodeName === 'body') {
          newEl = htmlDoc.body;
        } else {
          // Make a safe copy of the current node, if it is in our whitelist.
          newEl = contentWindow.document.createElement(nodeName);
        }
        // Update map of serialized XHTML nodes to iframe'd sanitized nodes.
        nodeCopyMap[curNode] = newEl;

        // Copy over all whitelisted attributes.
        if (curNode.nodeType === NodeType.ELEMENT && curNode.hasAttributes()) {
          const attrs = curNode.attributes;
          for (let i = 0; i < attrs.length; ++i) {
            const attr =  attrs.item(i);
            if (ATTRIBUTE_WHITELIST[nodeName] &&
                ATTRIBUTE_WHITELIST[nodeName].includes(attr.name)) {
              newEl.setAttribute(attr.name, attr.value);
            }
          }
        }
        outEl.appendChild(newEl);
      }
    });

    const curHead = htmlDoc.head;
    const curBody = htmlDoc.body;
    const nextPage = new XhtmlPage('htmlpage', iframeEl, () => {
      const cdoc = iframeEl.contentDocument;
      const cwin = iframeEl.contentWindow;
      cdoc.head.innerHTML = new XMLSerializer().serializeToString(curHead);
      cdoc.body.innerHTML = new XMLSerializer().serializeToString(curBody);

      walkDom(cdoc.documentElement, curNode => {
        if (curNode.nodeType === NodeType.ELEMENT && curNode.hasAttributes()) {
          const nodeName = curNode.nodeName.toLowerCase();
          const attrs = curNode.attributes;
          for (let i = 0; i < attrs.length; ++i) {
            const attr =  attrs.item(i);
            if (BLOB_URL_ATTRIBUTES[nodeName] &&
                BLOB_URL_ATTRIBUTES[nodeName].includes(attr.name)) {
              const ref = this.getManifestFileRef_(attr.value, this.spineRefs_[0].rootDir);
              if (!ref) {
                throw `Could not find a referenced file: ${attr.name}`;
              }
              curNode.setAttribute(ATTR_PREFIX + attr.name, attr.value);
              curNode.setAttribute(attr.name, ref.getBlobURL(cwin));
            }
          }
        }
      });
      // TODO: Move this styling into the BookViewer.
      iframeEl.setAttribute('style', 'width:100%;height:700px;border:0');
    });

    // TODO: Keep track of which document and element we are in, and keep creating XhtmlPages.

    this.notify(new BookProgressEvent(this, 2));
    this.notify(new BookPageExtractedEvent(this, nextPage, 2));

    this.notify(new BookBindingCompleteEvent(this, [onePager, nextPage]));
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

      const fileRef = new FileRef(id, filename, rootDir, mediaType, this.fileMap_.get(filename));
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
