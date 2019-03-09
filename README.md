# kthoom

kthoom is a comic book archive reader that runs in the browser using client-side open web technologies such as JavaScript, HTML5, the File API, Web Workers, and Typed Arrays.  It can open files from your local hard drive, IPFS, or Google Drive.

[OPEN KTHOOM COMIC BOOK READER](https://codedread.github.io/kthoom/index.html).

You can specify a comic book to load via the ?bookUri parameter.  Some examples:

  * https://codedread.github.io/kthoom/index.html?bookUri=examples/codedread.cbz
  * https://codedread.github.io/kthoom?bookUri=ipfs://Qma8Ru1qrJjeVcw5NpY8nXrCWnRhwZpKx617vV3atTYA9t
  * https://codedread.github.io/kthoom/index.html?bookUri=dweb:/ipfs/QmR1kv2G3XkN3xYW2wEpb8RHM41ze7KQzMCuW3h2PnXQ5c

## Documentation

### File Support

  * .cbz (zip)
  * .cbr ([rar](https://codedread.github.io/bitjs/docs/unrar.html))
  * .cbt (tar)

### Keyboard Shortcuts
  * O: Open files
  * Right/Left: Next/Previous page
  * ]: Next book
  * [: Prev book
  * H/W: Scale to height/width
  * B: Best Fit mode
  * R/L: Rotate right/left
  * 1/2: Show 1 or 2 pages side-by-side in the viewer.
  * X: Toggle progress bar visibility
  * S: Toggle the Reading Stack drawer open.
  * ?: Bring up Help screen

You can tell kthoom to open as many books as you like in the Choose Files dialog (shift-select all the books you want to open). Then navigate between books using the square bracket keys or use the Reading Stack drawer.

### Binary File Support

NOTE: kthoom loads in local compressed files and decompresses them in the browser, which means that kthoom has an implementation of unzip, unrar and untar in JavaScript. This code has been migrated to its own library: [BitJS](https://github.com/codedread/bitjs), a more general purpose library to deal with binary file data in native JavaScript.
