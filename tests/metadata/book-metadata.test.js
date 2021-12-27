import { createMetadataFromComicBookXml, BookMetadata, ComicBookMetadataType } from '../../code/metadata/book-metadata.js';

import 'mocha';
import { expect } from 'chai';

describe('Book Metadata', () => {
  let m1, m2;

  beforeEach(() => {
    m1 = new BookMetadata(ComicBookMetadataType.COMIC_RACK, [
      ['foo', 'abc'],
      ['bar', 'def'],
    ]);

    m2 = new BookMetadata(ComicBookMetadataType.COMIC_RACK, [
      ['bar', 'def'],
      ['foo', 'abc'],
    ]);
  });

  it('construction', () => {
    expect(m1.getBookType()).equals(ComicBookMetadataType.COMIC_RACK);
    expect(Array.from(m1.propertyEntries()).length).equals(2);
  });

  it('equals() compares all fields', () => {
    expect(m1.equals(m2)).true;

    m2 = new BookMetadata(ComicBookMetadataType.COMIC_RACK, [
      ['bar', 'def'],
      ['foo', 'abc'],
      ['baz', '123'],
    ]);

    expect(m1.equals(m2)).false;
  });
});
