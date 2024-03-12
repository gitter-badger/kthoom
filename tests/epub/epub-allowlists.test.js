import 'mocha';
import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import { EPUB_NAMESPACE, SVG_NAMESPACE, XLINK_NAMESPACE,
         isAllowedAttr, isAllowedElement } from '../../code/epub/epub-allowlists.js';

describe('EPUB Allowlists tests', () => {
  let doc;
  beforeEach(() => {
    const dom = new JSDOM('<html />');
    doc = dom.window.document;
  });

  describe('isAllowedAttr()', () => {
    let el;
    beforeEach(() => {
      el = doc.createElement('img');
    });

    it('throws on non-Attr', () => {
      const regex = /attr was not an Attr/;
      expect(() => isAllowedAttr(el, doc)).throws(regex);
      expect(() => isAllowedAttr(el, doc.createTextNode('hi'))).throws(regex);
      expect(() => isAllowedAttr(el, el)).throws(regex);
      expect(() => isAllowedAttr(el, doc.createComment('hi'))).throws(regex);
      expect(() => isAllowedAttr()).throws(regex);
    });

    it('returns false on disallowed attribute', () => {
      expect(isAllowedAttr(el, doc.createAttribute('onclick'))).equals(false);
    });

    it('returns true on allowed attributes', () => {
      expect(isAllowedAttr(el, doc.createAttribute('class'))).equals(true);
      expect(isAllowedAttr(el, doc.createAttribute('id'))).equals(true);
      expect(isAllowedAttr(el, doc.createAttribute('alt'))).equals(true);
      expect(isAllowedAttr(el, doc.createAttribute('src'))).equals(true);
      expect(isAllowedAttr(doc.createElement('link'), doc.createAttribute('href'))).equals(true);
    });

    it('returns true for allowed XML namespaced attributes', () => {
      const image = doc.createElementNS(SVG_NAMESPACE, 'image');
      expect(isAllowedAttr(image, doc.createAttributeNS(XLINK_NAMESPACE, 'href'))).equals(true);
      expect(isAllowedAttr(image, doc.createAttributeNS(EPUB_NAMESPACE, 'type'))).equals(true);
    });
  });

  describe('isAllowedElement()', () => {
    it('throws on non-Element', () => {
      const regex = /el was not an Element/;
      expect(() => isAllowedElement(doc)).throws(regex);
      expect(() => isAllowedElement(doc.createTextNode('hi'))).throws(regex);
      expect(() => isAllowedElement(doc.createAttribute('hi'))).throws(regex);
      expect(() => isAllowedElement(doc.createComment('hi'))).throws(regex);
      expect(() => isAllowedElement()).throws(regex);
    });

    it('returns false on disallowed Element', () => {
      expect(isAllowedElement(doc.createElement('script'))).equals(false);
    });

    it('returns true on allowed Elements', () => {
      expect(isAllowedElement(doc.createElement('p'))).equals(true);
      expect(isAllowedElement(doc.createElement('h1'))).equals(true);
      expect(isAllowedElement(doc.createElement('img'))).equals(true);
      expect(isAllowedElement(doc.createElement('head'))).equals(true);
      expect(isAllowedElement(doc.createElement('body'))).equals(true);
      expect(isAllowedElement(doc.createElementNS(SVG_NAMESPACE, 'image'))).equals(true);
      expect(isAllowedElement(doc.createElementNS(SVG_NAMESPACE, 'svg'))).equals(true);
    });
  });
});
