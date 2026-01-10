/**
 * books/metadata.go
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2021 Google Inc.
 */

// This package deals with metadata for books.
package metadata

import "encoding/xml"

// Generic type for unmarshalling any XML node.
type AnyNode struct {
	XMLName xml.Name
	Attrs   []xml.Attr `xml:",any,attr"`
	Content string     `xml:",innerxml"`
}

type ArchiveFileInfo struct {
	XMLName               xml.Name   `xml:"http://www.codedread.com/sop ArchiveFileInfo"`
	OptimizedForStreaming string     `xml:"optimizedForStreaming,attr"`
	Attributes            []xml.Attr `xml:",any,attr"`
	AnyNodes              []AnyNode  `xml:",any"`
}
