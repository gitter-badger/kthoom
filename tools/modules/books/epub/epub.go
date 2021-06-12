/**
 * books/epub.go
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2021 Google Inc.
 */

// This package extracts an epub book file.
package epub

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"io/ioutil"
	"os/exec"
	"path"
	"path/filepath"

	"github.com/codedread/kthoom/tools/modules/archives"
	"github.com/codedread/kthoom/tools/modules/books/metadata"
	"golang.org/x/net/html"
)

const containerFilename = "META-INFO/container.xml"

/**
 * Container.xml
	<?xml version='1.0' encoding='utf-8'?>
	<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
		<rootfiles>
			<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
		</rootfiles>
	</container>
*/

type RootFile struct {
	XMLName   xml.Name
	FullPath  string `xml:"full-path,attr"`
	MediaType string `xml:"media-type,attr"`
}
type RootFiles struct {
	XMLName  xml.Name
	RootFile []RootFile `xml:"rootfile"`
}
type Container struct {
	XMLName   xml.Name   `xml:"urn:oasis:names:tc:opendocument:xmlns:container container"`
	RootFiles *RootFiles `xml:"rootfiles"`
}

/**
 * OEBPS/content.opf
 */
type Itemref struct {
	XMLName xml.Name
	Idref   string `xml:"idref,attr"`
	Linear  string `xml:"linear,attr"`
}
type Spine struct {
	XMLName xml.Name
	Itemref []Itemref `xml:"itemref"`
}
type Item struct {
	XMLName   xml.Name
	Href      string `xml:"href,attr"`
	Id        string `xml:"id,attr"`
	MediaType string `xml:"media-type,attr"`
}
type Manifest struct {
	XMLName    xml.Name
	Item       []Item             `xml:"item"`
	AnyNodes   []metadata.AnyNode `xml:",any"`
	Attributes []xml.Attr         `xml:",any,attr"`
}
type Metadata struct {
	XMLName    xml.Name
	AnyNodes   []metadata.AnyNode `xml:",any"`
	Attributes []xml.Attr         `xml:",any,attr"`
}
type Package struct {
	XMLName         xml.Name           `xml:"http://www.idpf.org/2007/opf package"`
	Metadata        *Metadata          `xml:"metadata"`
	Manifest        *Manifest          `xml:"manifest"`
	Spine           *Spine             `xml:"spine"`
	AnyNodes        []metadata.AnyNode `xml:",any"`
	ArchiveFileInfo *metadata.ArchiveFileInfo
	PackageFilename string
}

type Book struct {
	*archives.Archive
	Container         *Container
	Package           *Package
	MimetypeFilename  string
	ContainerFilename string
	RootFilename      string
	ItemFilename      []string
	OrderedFiles      []string
}

func ExtractBookFromArchive(theArchive *archives.Archive, outWriter io.Writer, errWriter io.Writer) (*Book, error) {
	book := &Book{Archive: theArchive}

	// Ensure mimetype file exists.
	mimetype, mimeErr := archives.ReadFileFromArchive(book.Archive, "mimetype")
	if mimeErr != nil {
		return nil, mimeErr
	}

	if string(mimetype) != "application/epub+zip" {
		return nil, fmt.Errorf("No EPUB mimetype found in %s\n", theArchive.ArchiveFilename)
	}
	book.MimetypeFilename = filepath.Join(book.Archive.TmpDir, "mimetype")

	// Ensure META-INF/container.xml file exists.
	if !archives.HasFile(theArchive, "META-INF/container.xml") {
		err := fmt.Errorf("No container.xml found in %s\n", theArchive.ArchiveFilename)
		return nil, err
	}

	if populateErr := populateFromXml(book, outWriter, errWriter); populateErr != nil {
		return nil, populateErr
	}

	return book, nil
}

// Populates the container, rootfile, and item files.
func populateFromXml(book *Book, outWriter io.Writer, errWriter io.Writer) error {
	containerXml, readErr := archives.ReadFileFromArchive(book.Archive, "META-INF/container.xml")
	if readErr != nil {
		return readErr
	}

	fmt.Fprintf(outWriter, "META-INF/container.xml found and valid\n")
	book.ContainerFilename = filepath.Join(book.Archive.TmpDir, "META-INF/container.xml")

	book.Container = &Container{}
	if unMarshalErr := xml.Unmarshal(containerXml, &book.Container); unMarshalErr != nil {
		return unMarshalErr
	}

	// TODO: Will the above throw an error if no <rootfiles> element is found?

	if len(book.Container.RootFiles.RootFile) != 1 {
		return fmt.Errorf("%s Container.rootfiles had wrong number of <rootfile> elements", book.Archive.ArchiveFilename)
	}

	rootFilename := book.Container.RootFiles.RootFile[0].FullPath
	book.RootFilename = filepath.Join(book.Archive.TmpDir, rootFilename)
	rootXml, rootErr := archives.ReadFileFromArchive(book.Archive, rootFilename)
	if rootErr != nil {
		return rootErr
	}
	fmt.Fprintf(outWriter, "Root OPF file found and valid: %s\n", rootFilename)

	book.Package = &Package{PackageFilename: rootFilename}
	if unMarshalErr := xml.Unmarshal(rootXml, &book.Package); unMarshalErr != nil {
		return unMarshalErr
	}

	// By default, all files are added to the ItemFilename slice.
	for _, file := range book.Files {
		if file != book.MimetypeFilename && file != book.ContainerFilename && file != book.RootFilename {
			book.ItemFilename = append(book.ItemFilename, file)
		}
	}

	return nil
}

func getResourceById(book *Book, id string) *Item {
	for _, item := range book.Package.Manifest.Item {
		if item.Id == id {
			return &item
		}
	}
	return nil
}

func CreateOrderedBook(book *Book, outWriter io.Writer, errWriter io.Writer) error {
	baseIRI := filepath.Dir(book.Package.PackageFilename)
	fmt.Fprintf(outWriter, "baseIRI is %s\n", baseIRI)

	allFilesMap := make(map[string]bool)
	for _, file := range book.ItemFilename {
		allFilesMap[file] = true
	}

	for _, itemRef := range book.Package.Spine.Itemref {
		fmt.Fprintf(outWriter, "Found an itemref: %s\n", itemRef.Idref)

		// TODO: What to do about non-linear itemrefs?
		item := getResourceById(book, itemRef.Idref)
		if item == nil {
			return fmt.Errorf("%s Container is missing an item with id %s", book.ArchiveFilename, itemRef.Idref)
		}

		// Resolves item.Href into an absolute path that matches what is in allFilesMap.
		itemIRI := item.Href
		if !filepath.IsAbs(itemIRI) {
			itemIRI = filepath.Join(baseIRI, itemIRI)
		}
		itemIRI = filepath.Join(book.TmpDir, itemIRI)
		fmt.Fprintf(outWriter, "itemIRI is %s\n", itemIRI)

		mediaType := item.MediaType
		if mediaType == "application/xhtml+xml" || mediaType == "text/html" {
			htmlErr := processHtml(book, itemIRI, allFilesMap, outWriter, errWriter)
			if htmlErr != nil {
				return htmlErr
			}
		}

		// No matter what kind of item it was, add it to the ordered list and remove it from our map.
		book.OrderedFiles = append(book.OrderedFiles, itemIRI)
		delete(allFilesMap, itemIRI)
	}

	// Append any file we missed during processing to the end of OrderedFiles.
	for f, _ := range allFilesMap {
		book.OrderedFiles = append(book.OrderedFiles, f)
	}

	fmt.Fprintf(outWriter, "%d Files TOTAL\n", len(book.Files))
	fmt.Fprintf(outWriter, "%d Ordered Files\n", len(book.OrderedFiles))
	// mimetype, container and rootfile are separate from OrderedFiles.
	if len(book.Files) != len(book.OrderedFiles)+3 {
		return fmt.Errorf("Failed to order %d files for %s", (len(book.OrderedFiles) - len(book.Files)), book.ArchiveFilename)
	}

	book.ItemFilename = book.OrderedFiles

	return nil
}

func CreateArchiveFromBook(theBook *Book, outArchiveFilename string, outWriter io.Writer, errWriter io.Writer) error {
	zipMimetypeCmd := exec.Command("/usr/bin/zip", "-j", "-0", outArchiveFilename, theBook.MimetypeFilename)
	zipMimetypeCmd.Stdout = outWriter
	zipMimetypeCmd.Stderr = errWriter
	if err := zipMimetypeCmd.Run(); err != nil {
		return fmt.Errorf("Adding mimetype to zip finished with error: %v\n", err)
	}

	rootXml, marshalErr := xml.MarshalIndent(theBook.Package, "", "  ")
	if marshalErr != nil {
		return fmt.Errorf("Failed to marshal XML metadata: %v\n", marshalErr.Error())
	}
	fmt.Fprintf(outWriter, "Root file = %s\n", rootXml)

	if writeErr := ioutil.WriteFile(theBook.RootFilename, rootXml, 0644); writeErr != nil {
		return fmt.Errorf("Failed to create rootfile for %s: %v\n", theBook.RootFilename, writeErr)
	}
	fmt.Fprintf(outWriter, "Created metadata file: %s\n", theBook.RootFilename)

	var zipArgs = append([]string{"-j", "-9", outArchiveFilename, theBook.ContainerFilename,
		theBook.RootFilename}, theBook.ItemFilename...)
	zipCmd := exec.Command("/usr/bin/zip", zipArgs...)
	zipCmd.Stdout = outWriter
	zipCmd.Stderr = errWriter
	if err := zipCmd.Run(); err != nil {
		return fmt.Errorf("Adding zip page finished with error: %v\n", err)
	}

	return nil
}

func getAttr(token *html.Token, attrName string) string {
	for _, a := range token.Attr {
		if a.Key == attrName {
			return a.Val
		}
	}
	return ""
}

func addResourceToBook(book *Book, resourceURL string, baseURL string, allFilesMap map[string]bool) {
	resourceIRI := resourceURL
	// Resolve the URL.
	if !path.IsAbs(resourceIRI) {
		resourceIRI = path.Join(baseURL, resourceIRI)
	}

	// Then make it into a file path.
	resourceIRI = filepath.Join(book.Archive.TmpDir, resourceIRI)

	if allFilesMap[resourceIRI] {
		book.OrderedFiles = append(book.OrderedFiles, resourceIRI)
		delete(allFilesMap, resourceIRI)
		fmt.Printf("%s has been added to OrderedFiles, # of unmapped resources left = %d\n", resourceIRI, len(allFilesMap))
	} else {
		fmt.Printf("%s has already been added\n", resourceIRI)
	}
}

func processHtml(book *Book, itemIRI string, allFilesMap map[string]bool, outWriter io.Writer, errWriter io.Writer) error {
	relIRI, relErr := filepath.Rel(book.Archive.TmpDir, itemIRI)
	if relErr != nil {
		return relErr
	}
	baseURL := path.Dir(relIRI)
	fmt.Fprintf(outWriter, "relIRI = %s, baseURL = %s\n", relIRI, baseURL)

	htmlDoc, readErr := archives.ReadFileFromArchive(book.Archive, relIRI)
	if readErr != nil {
		return readErr
	}

	tokenizer := html.NewTokenizer(bytes.NewReader(htmlDoc))
	for {
		tokenType := tokenizer.Next()

		switch {
		case tokenType == html.ErrorToken:
			err := tokenizer.Err()
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("Error tokenizing HTML: %v", err)
		case tokenType == html.StartTagToken:
			// TODO: Do I need to have <img> and <link> processing here too?
			token := tokenizer.Token()
			resourceURL := ""
			if token.Data == "picture" {
				srcsetVal := getAttr(&token, "srcset")
				if srcsetVal != "" {
					fmt.Fprintf(outWriter, "Found a picture srcset: %s\n", srcsetVal)
					resourceURL = srcsetVal
				}
			}
			if resourceURL != "" {
				addResourceToBook(book, resourceURL, baseURL, allFilesMap)
			}
		case tokenType == html.SelfClosingTagToken:
			token := tokenizer.Token()
			resourceURL := ""
			if token.Data == "img" {
				srcVal := getAttr(&token, "src")
				if srcVal != "" {
					fmt.Fprintf(outWriter, "Found an img src: %s\n", srcVal)
					resourceURL = srcVal
				}
			} else if token.Data == "link" {
				relVal := getAttr(&token, "rel")
				hrefVal := getAttr(&token, "href")
				if relVal == "stylesheet" && hrefVal != "" {
					// TODO: processCSS()
					// import "github.com/gorilla/css/scanner"
					// https://www.gorillatoolkit.org/pkg/css/scanner
					fmt.Fprintf(outWriter, "Found a link href: %s\n", hrefVal)
					resourceURL = hrefVal
				}
			}
			if resourceURL != "" {
				addResourceToBook(book, resourceURL, baseURL, allFilesMap)
			}
		}
	}
}
