import 'mocha';
import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import { NodeType, walkDom } from '../../code/common/dom-walker.js';

describe('dom-walker', () => {
  describe('walkDom()', () => {
    let doc;
    beforeEach(() => {
      const dom = new JSDOM('<html>'
          + '<head>\n'
            + '<title>Title</title>'
          + '</head>'
          + '<body>\n'
            + '<p>hello</p>'
            + '<p>Goodbye</p>'
          + '</body>'
        + '</html>');
      doc = dom.window.document;
    });
  
    it('throws if args undefined', () => {
      expect(() => walkDom()).throws('Top node');
    });
  
    it('throws if top node has a parent', () => {
      const bodyEl = doc.querySelectorAll('body')[0];
      expect(() => walkDom(bodyEl)).throws('Top node');
    });
  
    it('throws if callbackFn is not a function', () => {
      expect(() => walkDom(doc.documentElement, undefined)).throws('callbackFn is not a function');
    });

    it('visits each node', () => {
      let numElements = 0;
      let numTextNodes = 0;
      let helloVisited = 0;
      let goodbyeVisited = 0;
      let bodyVisited = 0;
      let headVisited = 0;
      let titleVisited = 0;
      let htmlVisited = 0;
      walkDom(doc.documentElement, el => {
        if (el.nodeType === 1) {
          numElements++;
        } else if (el.nodeType === NodeType.TEXT) {
          numTextNodes++;
        }
        switch (el.localName) {
          case 'html': htmlVisited++; break;
          case 'head': headVisited++; break;
          case 'body': bodyVisited++; break;
          case 'title': titleVisited++; break;
          case 'p':
            if (el.textContent === 'hello') {
              helloVisited++;
            } else if (el.textContent === 'Goodbye') {
              goodbyeVisited++;
            }
            break;
        }
      });

      // <html>, <head>, <title>, <body>, and 2 <p>s.
      expect(numElements).equals(6);

      // The <title>, the two <p>s, and the two new-lines.
      expect(numTextNodes).equals(5);

      expect(helloVisited).equals(1);
      expect(goodbyeVisited).equals(1);
      expect(headVisited).equals(1);
      expect(bodyVisited).equals(1);
      expect(titleVisited).equals(1);
      expect(htmlVisited).equals(1);
    });
  });
});
