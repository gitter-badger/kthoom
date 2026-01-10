/**
 * archives/extract.go
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2021 Google Inc.
 */

// This package extracts an archive file.
package archives

import (
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
)

// This is how you do enums in go :-/
type ArchiveType int

const (
	Unknown ArchiveType = iota
	ComicBook
	EPub
)

func (t ArchiveType) String() string {
	return [...]string{"Unknown", "ComicBook", "EPub"}[t]
}

type Archive struct {
	ArchiveFilename string
	ArchiveType
	TmpDir string
	Files  []string
}

func CleanupArchive(archive *Archive) {
	if archive == nil || archive.TmpDir == "" {
		return
	}

	if err := os.RemoveAll(archive.TmpDir); err != nil {
		panic(err)
	}
}

func ExtractArchive(path string, outWriter io.Writer, errWriter io.Writer) (*Archive, error) {
	tmpdir, err := ioutil.TempDir("", "bish")
	if err != nil {
		return nil, err
	}

	// Some archive files have incorrect extensions, so we cannot rely on them.  We need to do some
	// byte sniffing instead.
	var file *os.File
	file, err = os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var header [4]byte
	if _, err = io.ReadFull(file, header[:]); err != nil {
		return nil, err
	}

	var cmd *exec.Cmd
	if header[0] == 0x52 && header[1] == 0x61 && header[2] == 0x72 && header[3] == 0x21 { // Rar!
		cmd = exec.Command("unrar", "x", path)
	} else if header[0] == 0x50 && header[1] == 0x4B { // PK (Zip)
		cmd = exec.Command("unzip", path)
	}

	cmd.Dir = tmpdir
	cmd.Stdout = outWriter
	cmd.Stderr = errWriter

	if err = cmd.Run(); err != nil {
		exitErr, ok := err.(*exec.ExitError)
		// If the error was not an ExitError, or the error code was not 3 (unrar CRC error code),
		// we bail. Otherwise we continue trying to process the unarchived files.
		if !ok || exitErr.ExitCode() != 3 {
			err = fmt.Errorf("%s had an error: %v", path, err)
			return nil, err
		}
	}

	theArchive := &Archive{ArchiveFilename: path, TmpDir: tmpdir}

	filepath.Walk(theArchive.TmpDir, func(f string, info os.FileInfo, err error) error {
		if err != nil {
			err = fmt.Errorf("%s had an error: %v", theArchive.ArchiveFilename, err)
			return err
		}

		fmt.Fprintf(outWriter, "Found an entry %s...", f)
		if !info.IsDir() {
			fmt.Fprintf(outWriter, "added file")
			theArchive.Files = append(theArchive.Files, f)
		} else {
			// Ignore sub-directories.
		}

		fmt.Fprintf(outWriter, "\n")
		return nil
	})

	theArchive.ArchiveType = getArchiveType(theArchive)

	return theArchive, nil
}

func HasFile(archive *Archive, relPath string) bool {
	fullPath := filepath.Join(archive.TmpDir, relPath)
	for _, path := range archive.Files {
		if path == fullPath {
			return true
		}
	}
	return false
}

// TODO: Write a unit test for this.
func getArchiveType(archive *Archive) ArchiveType {
	// If the archive has a META-INF/container.xml in it, it's probably an EPub.
	if HasFile(archive, "META-INF/container.xml") {
		return EPub
	}

	// Otherwise, if it ends in .cb? then it's probably a ComicBook.
	ext := filepath.Ext(archive.ArchiveFilename)
	if len(ext) == 4 && ext[1] == 'c' && ext[2] == 'b' {
		return ComicBook
	}

	// Otherwise, Unknown.
	return Unknown
}

func ReadFileFromArchive(archive *Archive, relPath string) ([]byte, error) {
	var absPath = filepath.Join(archive.TmpDir, relPath)
	fileContents, readErr := ioutil.ReadFile(absPath)
	if readErr != nil {
		err := fmt.Errorf("Could not read file from archive %s: %v", archive.ArchiveFilename, readErr)
		return nil, err
	}
	return fileContents, nil
}
