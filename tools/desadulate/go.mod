module github.com/codedread/kthoom/tools/desadulate

go 1.16

replace (
  github.com/codedread/kthoom/tools/modules/archives => ../modules/archives
  github.com/codedread/kthoom/tools/modules/books => ../modules/books
  github.com/codedread/kthoom/tools/modules/images => ../modules/images
)

require (
	github.com/codedread/kthoom/tools/modules/archives v0.0.0-00010101000000-000000000000
	github.com/codedread/kthoom/tools/modules/books v0.0.0-00010101000000-000000000000
	github.com/codedread/kthoom/tools/modules/images v0.0.0-00010101000000-000000000000
)