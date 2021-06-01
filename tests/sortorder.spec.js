import { Page } from '../code/page.js';
import { sortPages } from '../code/comic-book-page-sorter.js';

import * as fs from 'fs';
import 'mocha';
import { expect } from 'chai';

describe('Sort order', () => {
  let testSpecs = JSON.parse(fs.readFileSync('./tests/sortorder.tests.json').toString());
  for (const spec of testSpecs) {
    it(spec.desc, () => {
      const pages = spec.input.map(name => new Page(name, 'image/jpeg'));
      const output = pages.sort(sortPages).map(page => page.getPageName());
      expect(output).to.eql(spec.expected);
    });
  }
});
