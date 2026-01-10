import 'mocha';
import { expect } from 'chai';
import { FitMode } from '../../code/book-viewer-types.js';
import { TwoPageSetter } from '../../code/pages/two-page-setter.js';

/** @typedef {import('../../code/book-viewer-types.js').Box} Box */
/** @typedef {import('../../code/book-viewer-types.js').PageLayoutParams} PageLayoutParams */
/** @typedef {import('../../code/book-viewer-types.js').PageSetting} PageSetting */

describe('TwoPageSetter', () => {
  /** @type {PageLayoutParams} */
  let layoutParams;

  /** @type {TwoPageSetter} */
  let setter;

  beforeEach(() => {
    layoutParams = {};
    setter = new TwoPageSetter();
  });

  describe('FitMode.Width', () => {
    beforeEach(() => {
      layoutParams.fitMode = FitMode.Width;
    });

    describe('no rotation', () => {
      beforeEach(() => {
        layoutParams.rotateTimes = 0;
      });

      it(`sizes page properly when par < bvar`, () => {
        const PAGE_ASPECT_RATIO = 0.5;
        const BV_WIDTH = 400;
        const BV_HEIGHT = 200;
        layoutParams.pageAspectRatio = PAGE_ASPECT_RATIO;
        layoutParams.bv = { left: 0, top: 0, width: BV_WIDTH, height: BV_HEIGHT };
  
        /** @type {PageSetting} */
        const pageSetting = setter.updateLayout(layoutParams);
        expect(pageSetting.boxes).to.be.an('array');
        expect(pageSetting.boxes).to.have.lengthOf(2);
  
        /** @type {Box} */
        const box1 = pageSetting.boxes[0];
        expect(box1.left).equals(0);
        expect(box1.top).equals(0);
        expect(box1.width).equals(BV_WIDTH / 2);
        expect(box1.height).equals(BV_WIDTH / 2 / PAGE_ASPECT_RATIO);
  
        /** @type {Box} */
        const box2 = pageSetting.boxes[0];
        expect(box2.left).equals(0);
        expect(box2.top).equals(0);
        expect(box2.width).equals(BV_WIDTH / 2);
        expect(box2.height).equals(BV_WIDTH / 2 / PAGE_ASPECT_RATIO);
      });

      it(`centers page vertically when par > bvar`, () => {
        const PAGE_ASPECT_RATIO = 0.5;
        const BV_WIDTH = 400;
        const BV_HEIGHT = 1200;
        layoutParams.pageAspectRatio = PAGE_ASPECT_RATIO;
        layoutParams.bv = { left: 0, top: 0, width: BV_WIDTH, height: BV_HEIGHT };

        /** @type {PageSetting} */
        const pageSetting = setter.updateLayout(layoutParams);
        expect(pageSetting.boxes).to.be.an('array');
        expect(pageSetting.boxes).to.have.lengthOf(2);

        /** @type {Box} */
        const box1 = pageSetting.boxes[0];
        expect(box1.width).equals(BV_WIDTH / 2);
        expect(box1.height).equals(BV_WIDTH / 2 / PAGE_ASPECT_RATIO);
        expect(box1.left).equals(0);
        expect(box1.top).equals((BV_HEIGHT - BV_WIDTH / 2 / PAGE_ASPECT_RATIO) / 2);

        /** @type {Box} */
        const box2 = pageSetting.boxes[1];
        expect(box2.width).equals(BV_WIDTH / 2);
        expect(box2.height).equals(BV_WIDTH / 2 / PAGE_ASPECT_RATIO);
        expect(box2.left).equals(BV_WIDTH / 2);
        expect(box2.top).equals((BV_HEIGHT - BV_WIDTH / 2 / PAGE_ASPECT_RATIO) / 2);
      });
    });
  });

  describe('FitMode.Height', () => {
    beforeEach(() => {
      layoutParams.fitMode = FitMode.Height;
    });

    describe('no rotation', () => {
      beforeEach(() => {
        layoutParams.rotateTimes = 0;
      });

      it(`sizes page properly when par > bvar`, () => {
        const PAGE_ASPECT_RATIO = 2;
        const BV_WIDTH = 200;
        const BV_HEIGHT = 400;
        layoutParams.pageAspectRatio = PAGE_ASPECT_RATIO;
        layoutParams.bv = { left: 0, top: 0, width: BV_WIDTH, height: BV_HEIGHT };

        /** @type {PageSetting} */
        const pageSetting = setter.updateLayout(layoutParams);
        expect(pageSetting.boxes).to.be.an('array');
        expect(pageSetting.boxes).to.have.lengthOf(2);

        /** @type {Box} */
        const box1 = pageSetting.boxes[0];
        expect(box1.top).equals(0);
        expect(box1.height).equals(BV_HEIGHT);
        expect(box1.left).equals(0);
        expect(box1.width).equals(BV_HEIGHT * PAGE_ASPECT_RATIO);

        const box2 = pageSetting.boxes[1];
        expect(box2.top).equals(0);
        expect(box2.height).equals(BV_HEIGHT);
        expect(box2.left).equals(BV_HEIGHT * PAGE_ASPECT_RATIO);
        expect(box2.width).equals(BV_HEIGHT * PAGE_ASPECT_RATIO);

        // Width of the book viewer should have been changed.
        expect(pageSetting.bv.width).equals(BV_HEIGHT * PAGE_ASPECT_RATIO * 2);
      });

      it(`centers horizontally when par < bvar`, () => {
        const PAGE_ASPECT_RATIO = 0.5;
        const BV_WIDTH = 400;
        const BV_HEIGHT = 400;
        layoutParams.pageAspectRatio = PAGE_ASPECT_RATIO;
        layoutParams.bv = { left: 0, top: 0, width: BV_WIDTH, height: BV_HEIGHT };

        /** @type {PageSetting} */
        const pageSetting = setter.updateLayout(layoutParams);
        expect(pageSetting.boxes).to.be.an('array');
        expect(pageSetting.boxes).to.have.lengthOf(2);

        /** @type {Box} */
        const box1 = pageSetting.boxes[0];
        expect(box1.top).equals(0);
        expect(box1.height).equals(BV_HEIGHT);
        expect(box1.width).equals(BV_HEIGHT * PAGE_ASPECT_RATIO);
        expect(box1.left).equals(0);

        /** @type {Box} */
        const box2 = pageSetting.boxes[1];
        expect(box2.top).equals(0);
        expect(box2.height).equals(BV_HEIGHT);
        expect(box2.width).equals(BV_HEIGHT * PAGE_ASPECT_RATIO);
        expect(box2.left).equals(BV_HEIGHT * PAGE_ASPECT_RATIO);
      });
    });
  });
});
