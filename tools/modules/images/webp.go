/**
 * images/webp.go
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2021 Google Inc.
 */

// Package for dealing with images.
package images

import (
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"strings"
)

func ConvertFileToWebp(imgFilename string, outWriter io.Writer, errWriter io.Writer) (string, error) {
	ext := strings.ToLower(filepath.Ext(imgFilename))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" {
		return "", fmt.Errorf("'%s' cannot be converted to Webp", imgFilename)
	}

	newImgFilename := imgFilename[0:len(imgFilename)-len(ext)] + ".webp"

	convertCmd := exec.Command("cwebp", "-quiet", imgFilename, "-o", newImgFilename)
	convertCmd.Stdout = outWriter
	convertCmd.Stderr = errWriter
	convertErr := convertCmd.Run()
	if convertErr != nil {
		return "", fmt.Errorf("cwebp finished with error: %v\n", convertErr)
	}

	return newImgFilename, nil
}
