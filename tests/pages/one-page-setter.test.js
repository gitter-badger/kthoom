import { FitMode } from '../../code/book-viewer-types.js';
import { OnePageSetter } from '../../code/pages/one-page-setter.js';

import 'mocha';
import { expect } from 'chai';

/** @typedef {import('../../code/book-viewer-types.js').Box} Box */
/** @typedef {import('../../code/book-viewer-types.js').PageLayoutParams} PageLayoutParams */
/** @typedef {import('../../code/book-viewer-types.js').PageSetting} PageSetting */

describe('OnePageSetter', () => {
  /** @type {PageLayoutParams} */
  let layoutParams;

  /** @type {OnePageSetter} */
  let setter;

  beforeEach(() => {
    layoutParams = {};
    setter = new OnePageSetter();
  });

  describe('FitMode.Width', () => {
    beforeEach(() => {
      layoutParams.fitMode = FitMode.Width;
    });

    describe('no rotation', () => {
      beforeEach(() => {
        layoutParams.rotateTimes = 0;
      });

      it(`sizes page properly`, () => {
        const AR = 0.5;
        const BV_WIDTH = 400;
        const BV_HEIGHT = 400;
        layoutParams.pageAspectRatio = AR;
        layoutParams.bv = { left: 0, top: 0, width: BV_WIDTH, height: BV_HEIGHT };

        /** @type {PageSetting} */
        const pageSetting = setter.updateLayout(layoutParams);
        expect(pageSetting.boxes).to.be.an('array');
        expect(pageSetting.boxes).to.have.lengthOf(1);

        /** @type {Box} */
        const box1 = pageSetting.boxes[0];
        expect(box1.left).equals(0);
        expect(box1.width).equals(BV_WIDTH);
        expect(box1.top).equals(0);
        expect(box1.height).equals(BV_WIDTH/AR);
      });  

      it(`centers page vertically when it can fit`, () => {
        const AR = 0.5;
        const BV_WIDTH = 400;
        const BV_HEIGHT = 1200;
        layoutParams.pageAspectRatio = AR;
        layoutParams.bv = { left: 0, top: 0, width: BV_WIDTH, height: BV_HEIGHT };

        /** @type {PageSetting} */
        const pageSetting = setter.updateLayout(layoutParams);
        expect(pageSetting.boxes).to.be.an('array');
        expect(pageSetting.boxes).to.have.lengthOf(1);

        /** @type {Box} */
        const box1 = pageSetting.boxes[0];
        expect(box1.left).equals(0);
        expect(box1.width).equals(BV_WIDTH);
        expect(box1.top).equals((BV_HEIGHT - BV_WIDTH/AR)/2);
        expect(box1.height).equals(BV_WIDTH/AR);
      });
    });

  });
});
