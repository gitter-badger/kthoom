/**
 * books/comic.go
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2021 Google Inc.
 */

// This package extracts a comic book file.
package comic

import (
	"encoding/xml"
	"fmt"
	"io"
	"io/ioutil"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/codedread/kthoom/tools/modules/archives"
	"github.com/codedread/kthoom/tools/modules/books/metadata"
)

var filenamesToIgnore = []string{
	"thumbs.db",
}

const metadataFilename = "comicinfo.xml"

type ComicInfo struct {
	XMLName         xml.Name
	ArchiveFileInfo *metadata.ArchiveFileInfo
	Attributes      []xml.Attr         `xml:",any,attr"`
	AnyNodes        []metadata.AnyNode `xml:",any"`
}

type Book struct {
	*archives.Archive
	MetadataFilename string
	Metadata         *ComicInfo
	PageFiles        []string
}

func ExtractBookFromFilename(archiveFilename string, outWriter io.Writer, errWriter io.Writer) (*Book, error) {
	theArchive, err := archives.ExtractArchive(archiveFilename, outWriter, errWriter)
	if err != nil {
		err = fmt.Errorf("Extracting %s had an error: %v", archiveFilename, err)
		return nil, err
	}

	return ExtractBookFromArchive(theArchive, outWriter, errWriter)
}

func ExtractBookFromArchive(theArchive *archives.Archive, outWriter io.Writer, errWriter io.Writer) (*Book, error) {
	book := &Book{Archive: theArchive}

	for _, filename := range book.Files {
		if strings.ToLower(filename) == metadataFilename {
			// Keeps the original capitalization of the filename.
			book.MetadataFilename = filename
			continue
		}

		// Skip any files that need ignoring.
		ignore := false
		for _, n := range filenamesToIgnore {
			if strings.ToLower(filename) == n {
				ignore = true
				break
			}
		}
		if ignore {
			continue
		}

		book.PageFiles = append(book.PageFiles, filename)
	}

	err := findMetadata(book, outWriter, errWriter)
	if err != nil {
		err = fmt.Errorf("findMetadata() on %s had an error: %v", theArchive.ArchiveFilename, err)
		return nil, err
	}

	return book, nil
}

func CreateArchiveFromBook(theBook *Book, outArchiveFilename string, outWriter io.Writer, errWriter io.Writer) error {
	// Create metadata file.
	outputXml, marshalErr := xml.MarshalIndent(theBook.Metadata, "", "  ")
	if marshalErr != nil {
		return fmt.Errorf("Failed to marshal XML metadata: %v\n", marshalErr.Error())
	}

	metadataFilename := filepath.Join(theBook.TmpDir, "ComicInfo.xml")
	if writeErr := ioutil.WriteFile(metadataFilename, outputXml, 0644); writeErr != nil {
		return fmt.Errorf("Failed to create metadata file for %s: %v\n", metadataFilename, writeErr)
	}
	fmt.Fprintf(outWriter, "Created metadata file: %s\n", metadataFilename)

	zipMetadataCmd := exec.Command("/usr/bin/zip", "-j", "-0", outArchiveFilename, metadataFilename)
	zipMetadataCmd.Stdout = outWriter
	zipMetadataCmd.Stderr = errWriter
	if err := zipMetadataCmd.Run(); err != nil {
		return fmt.Errorf("Adding zip metadata finished with error: %v\n", err)
	}

	// Now add all the pages (images).
	var zipArgs = append([]string{"-j", "-9", outArchiveFilename}, theBook.PageFiles...)
	zipCmd := exec.Command("/usr/bin/zip", zipArgs...)
	zipCmd.Stdout = outWriter
	zipCmd.Stderr = errWriter

	if err := zipCmd.Run(); err != nil {
		return fmt.Errorf("Adding zip page finished with error: %v\n", err)
	}

	return nil
}

func findMetadata(book *Book, outWriter io.Writer, errWriter io.Writer) error {
	// Unmarshal XML metadata.
	var err error
	if book.MetadataFilename != "" {
		metadata, readErr := archives.ReadFileFromArchive(book.Archive, book.MetadataFilename)
		if readErr != nil {
			err := fmt.Errorf("Could not read metadata file in %s: %v", book.ArchiveFilename, readErr)
			return err
		}

		book.Metadata = &ComicInfo{}
		err = xml.Unmarshal(metadata, &book.Metadata)
		if err != nil {
			err = fmt.Errorf("%s had an error when unmarshalling XML: %v", book.ArchiveFilename, err)
			return err
		}
	}

	return err
}
