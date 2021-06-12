# Desadulate

A program that builds a better comic book archive file by ensuring the files inside
the zip are in order so that the archive can be streamed and unopened on the fly.

## Getting Started

  * Install golang
  * Install cwebp (if you want to convert images to webp format)
  * ```cd tools/desadulate```
  * ```go build```

## Command-line arguments

### Required arguments
| Argument               | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| -i /old/path/to/comics | The input path where the comic book archive files are located.            |
| -o /new/path/to/comics | The output path where the new comic book archive files should be created. |
| -f sub/path/comic.cbz  | The relative path inside of the input path pointing to the comic book.    |

### Optional arguments
| Argument               | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| -webp                  | Convert all images in the archive to the WebP format.                     |

## Running desadulate

To convert /old/path/to/comics/foo/bar/book.cbz into /new/path/to/comics/foo/bar/book.cbz:

  * desadulate -i /old/path/to/comics -o /new/path/to/comics -f foo/bar/book.cbz

To convert all comic books in /old/path/to/comics/ and put into /new/path/to/comics/:

  * shopt -s globstar ; ls /old/path/to/comics/**/*.cb? | cut -c20- | parallel desadulate -i /old/path/to/comics -o /new/path/to/comics -f {}
