# Introduction #

Browsers are starting to support the [File API: Directories and System spec](http://www.w3.org/TR/file-system-api/).  This page discusses a possible feature we could add to kthoom so that working with files is even easier for the user.

Browsers do not support easy access to the local file system of the user.  This is by design so that web apps cannot scan the hard drive for sensitive data.  Every file that the browser reads via [FileReader](http://www.w3.org/TR/file-api/) has to be specifically chosen by the user via a File input / picker dialog.

The idea of this feature is that kthoom would read in the comic book(s) chosen by the user and import then into a sandboxed file system that is the user's "library" of comic books.  This would have the following benefits:

  * Can do the decompression once and just store the images in the file system for quicker access
  * Can let the user "browse" their library without requiring access to the file system
  * Can provide richer access to the library (searching, categorization, etc) in the browser

# Details #

## Phase One ##

I've only just started looking at the spec.  I notice that Chrome today supports window.webkitRequestFileSystem().  As a first pass to test out these features we could:

  * whenever a user loads in a comic book, check if the browser's file system has a directory that matches the path/filename exactly.
  * if not present:
    * unzip/unrar the comic
    * create a directory with the same name as the file
    * store all image files in that directory
    * store a JSON file (index.json) that describes all the files in proper order that are present in the folder (this file can later be used to add metadata)
  * if present, then load in index.json and the first image and display it

This would have the benefit of making future reads of that comic book much faster.

## Phase Two ##

A second phase of this feature might be to allow a user to import a large number of comic books at once (allow multiselect in the file picker - is this possible?).  We could have an 'import' button (or just a keyboard shortcut) that lets the user pick any number of files then off in a separate thread does the importing as above but still lets the user do some other action.  While the import is going on, pressing 'i' would show the overlay the import progress bar for a second or two and then fade it away.

## Phase Three ##

Display a window of all imported comic books in the user's library and let them choose one to open...