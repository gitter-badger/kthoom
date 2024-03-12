[![Node.js CI](https://github.com/codedread/kthoom/actions/workflows/node.js.yml/badge.svg)](https://github.com/codedread/kthoom/actions/workflows/node.js.yml)
[![CodeQL](https://github.com/starnowski/posmulten/workflows/CodeQL/badge.svg)](https://github.com/codedread/kthoom/actions/workflows/codeql-analysis.yml)

# kthoom

![kthoom logo](images/logo.svg)

kthoom is a comic book / ebook reader that runs in the browser using modern web technologies such as
JavaScript, HTML5, the [File System Access API](https://wicg.github.io/file-system-access/), ES
Modules, Web Workers, Typed Arrays, and more.  It can open files and directories from your local
file system, the network, or Google Drive. It can be embedded in larger web apps.

It is built using pure JavaScript with no external dependencies and no JS frameworks. It can run
out of the box without any build / compile / transpile / pack step, straight from the browser.
Try it here:

[OPEN KTHOOM COMIC BOOK READER](https://codedread.com/kthoom/index.html).

You can also specify a comic book to load via the ?bookUri parameter.  Some examples:

  * https://codedread.github.io/kthoom/index.html?bookUri=examples/codedread.cbz
  * https://codedread.github.io/kthoom/index.html?bookUri=examples/alice-in-wonderland.epub

Or a [comic book reading list](https://github.com/codedread/kthoom/tree/master/reading-lists) via
the ?readingListUri parameter.

## Documentation

### File Support

  * .cbz (zip)
  * .cbr ([rar](https://codedread.github.io/bitjs/docs/unrar.html))
  * .cbt (tar)
  * .epub (Alpha-level support, a work-in-progress, see
    [issue list](https://github.com/codedread/kthoom/labels/epub))

### Keyboard Shortcuts
  * O / D / U: Open books by choosing files/directories from computer or by URL.
  * Right/Left: Next/Previous page of book.
  * Shift + Right/Left: Last/First page of book.
  * [ / ]: Prev / Next book
  * H/W: Scale to height/width
  * B: Best Fit mode
  * R/L: Rotate right/left
  * 1/2: Show 1 or 2 pages side-by-side in the viewer.
  * 3: Long Strip viewer.
  * F: Toggle fullscreen.
  * P: Hide metadata viewer and reading stack panel buttons.
  * S: Toggle the Reading Stack tray open.
  * T: Toggle the Metadata Tag Viewer tray open.
  * ?: Bring up Help screen

You can tell kthoom to open as many books as you like in the Choose Files dialog (shift-select all
the books you want to open). Then navigate between books using the square bracket keys or use the
Reading Stack tray.

### Binary File Support

NOTE: kthoom loads in local compressed files and decompresses them in the browser, which means that
kthoom has an implementation of unzip, unrar and untar in JavaScript. This code lives in its own
library: [BitJS](https://github.com/codedread/bitjs), a more general purpose library to deal with
binary file data in native JavaScript. Kthoom keeps an up-to-date version of bitjs in its
repository.

### JSON Reading Lists

kthoom supports loading lists of comic book files at once.  Think audio playlists but for comic
books!  See [JSON Reading Lists](https://github.com/codedread/kthoom/tree/master/reading-lists) for
more.

### URL parameters

  * alwaysOptimizedForStreaming=true: Tells kthoom to render pages immediately as they are
    de-compressed (this might not work for all comic books as some are not compressed in the order
    of reading)
  * bookUri=&lt;url&gt;: Tells kthoom to open the given book (cbz/cbr file).
  * doNotPromptOnClose=true: Tells kthoom not to ask the user if they are sure they want to close.
  * preventUserOpeningBooks=true: Prevents users from opening files in kthoom (useful for hosting
    kthoom from a web app).
  * readingListUri=&lt;url&gt;: Tells kthoom to load the given JSON Reading List (jrl) file and open
    the first file in that list.
