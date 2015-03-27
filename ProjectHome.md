## Intro ##

kthoom is a comic book archive reader that runs in the browser using client-side open web technologies such as JavaScript, HTML5, the File API, Web Workers, and Typed Arrays.

Due to the advanced web technologies, kthoom only has a chance to work on the following browsers:

  * Chrome 12+
  * Firefox 7+
  * IE10 preview 4 (maybe, can someone confirm?)

## Demo ##

[Try it out here](http://kthoom.googlecode.com/hg/index.html).

## File Support ##

  * .cbz (zip)
  * .cbr (rar)
  * .cbt (tar)

### Keyboard Shortcuts ###

  * O: Open a file
  * Right/Left: Next/Previous page
  * ]: Next book
  * [: Prev book
  * H/W: Scale to height/width
  * B: Best Fit mode
  * X: Toggle progress bar visibility
  * R/L: Rotate right/left
  * F: Flip one way, then the other, then restore orientation

If kthoom thinks the browser is in full-screen mode, it will hide the progress bar.

You can tell kthoom to open" as many books as you like in the Choose Files dialog.  Then navigate between books using the square bracket keys.

**NOTE**: kthoom loads in local compressed files and decompresses them in the browser, which means that kthoom has an implementation of unzip, unrar and untar in JavaScript.  Portions of this code have been migrated to its own library: BitJS http://bitjs.googlecode.com/, a more general purpose library to deal with binary file data in the browser.

See [the RAR format documentation](http://kthoom.googlecode.com/hg/docs/unrar.html) for an in-progress working document of the RAR format.