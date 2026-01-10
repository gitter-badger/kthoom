/**
 * One of the worst things about the Comic Book Archive format is that it is de facto.
 * Most definitions say the sort order is supposed to be lexically sorted filenames.
 * However, some comic books, and therefore some reader apps, do not follow this rule.
 * We will carefully add special cases here as we find them in the wild.  We may not be
 * able to handle every case; some books are just broken.
 * @param {Page} a 
 * @param {Page} b 
 * @returns 
 */
 export function sortPages(a, b) {
  // =====================================================================================
  // Special Case 1:  Files are incorrectly named foo8.jpg, foo9.jpg, foo10.jpg.
  // This causes foo10.jpg to sort before foo8.jpg when listing alphabetically.

  // Strip off file extension.
  const aName = a.getPageName().replace(/\.[^/.]+$/, '');
  const bName = b.getPageName().replace(/\.[^/.]+$/, '');

  // If we found numbers at the end of the filenames ...
  const aMatch = aName.match(/(\d+)$/g);
  const bMatch = bName.match(/(\d+)$/g);
  if (aMatch && aMatch.length === 1 && bMatch && bMatch.length === 1) {
    // ... and the prefixes case-insensitive match ...
    const aPrefix = aName.substring(0, aName.length - aMatch[0].length);
    const bPrefix = aName.substring(0, bName.length - bMatch[0].length);
    if (aPrefix.toLowerCase() === bPrefix.toLowerCase()) {
      // ... then numerically evaluate the numbers for sorting purposes.
      return parseInt(aMatch[0], 10) > parseInt(bMatch[0], 10) ? 1 : -1;
    }
  }

  // Special Case 2?  I've seen this one a couple times:
  // RobinHood12-02.jpg, RobinHood12-03.jpg, robinhood12-01.jpg, robinhood12-04.jpg.
  // If a common prefix is used, and we find a file that has the same common prefix
  // but not the right case, then case-insensitive lexical sort?

  // =====================================================================================

  // Default is case-sensitive lexical/alphabetical sort.
  return a.getPageName() > b.getPageName() ? 1 : -1;
}
