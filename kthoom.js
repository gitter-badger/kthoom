/*
 * thoom.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Jeff Schiller
 *
 */

/* Reference Documentation:

  * File API (FileReader): http://www.w3.org/TR/FileAPI/
  * Web Workers: http://www.whatwg.org/specs/web-workers/current-work/
  * Web Workers in Mozilla: https://developer.mozilla.org/En/Using_web_workers

*/

if (!window.console) {
	window.console = {};
	window.console.log = function(str) {};
	window.console.dir = function(str) {};
}
if (window.opera) {
	window.console.log = function(str) {opera.postError(str);};
	window.console.dir = function(str) {};
}

// TODO: stop polluting the window namespace and stuff into a kthoom object

// key codes
// TODO: is this reliable?
var Key = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, L: 76, R: 82 };

// global variables
var currentImage = -1,
	imageFiles = [],
	imageFilenames = [];

// stores an image filename and its data: URI
// TODO: investigate if we really need to store as base64 (leave off ;base64 and just
//       non-safe URL characters are encoded as %xx ?)
//       This would save 25% on memory since base64-encoded strings are 4/3 the size of the binary
function ImageFile(filename, bytes) {
	this.filename = filename;
	this.dataURI = "data:image/jpeg;base64," + Utils.encode64(bytes);
}

// gets the element with the given id
function getElem(id) {
	if(document.documentElement.querySelector) {
		// querySelector lookup
		return document.body.querySelector('#'+id);
	}	
	// getElementById lookup
	return document.getElementById(id);
}

function resetFileUploader() {
	getElem("uploader").innerHTML = '<input id="filechooser" type="file"/>';
	getElem("filechooser").addEventListener("change", getFile, false);
}

function initProgressMeter() {
	var svgns = "http://www.w3.org/2000/svg";
	var pdiv = document.getElementById("progress");
	var svg = document.createElementNS(svgns, "svg");
	
	var defs = document.createElementNS(svgns, "defs");

	var patt = document.createElementNS(svgns, "pattern");
	patt.id = "progress_pattern";
	patt.setAttribute("width", "30");
	patt.setAttribute("height", "20");
	patt.setAttribute("patternUnits", "userSpaceOnUse");

	var rect = document.createElementNS(svgns, "rect");
	rect.setAttribute("width", "100%");
	rect.setAttribute("height", "100%");
	rect.setAttribute("fill", "red");
	
	var poly = document.createElementNS(svgns, "polygon");
	poly.setAttribute("fill", "yellow");
	poly.setAttribute("points", "15,0 30,0 15,20 0,20");

	patt.appendChild(rect);
	patt.appendChild(poly);
	defs.appendChild(patt);
	
	svg.appendChild(defs);
	
	var g = document.createElementNS(svgns, "g");
	
	var outline = document.createElementNS(svgns, "rect");
	outline.setAttribute("y", "1");
	outline.setAttribute("width", "100%");
	outline.setAttribute("height", "13");
	outline.setAttribute("fill", "#777");
	outline.setAttribute("stroke", "white");
	outline.setAttribute("rx", "5");
	outline.setAttribute("ry", "5");
	g.appendChild(outline);

	var title = document.createElementNS(svgns, "text");
	title.id = "progress_title";
	title.appendChild(document.createTextNode("0%"));
	title.setAttribute("y", "11.5");
	title.setAttribute("x", "99%");
	title.setAttribute("fill", "white");
	title.setAttribute("font-size", "14px");
	title.setAttribute("text-anchor", "end");
	g.appendChild(title);
	
	var meter = document.createElementNS(svgns, "rect");
	meter.id = "meter";
	meter.setAttribute("width", "0%");
	meter.setAttribute("height", "16");
	meter.setAttribute("fill", "url(#progress_pattern)");
	meter.setAttribute("rx", "5");
	meter.setAttribute("ry", "5");
	
	g.appendChild(meter);
	svg.appendChild(g);
	pdiv.appendChild(svg);
}

function setProgressMeter(pct) {
	var pct = (pct*100);
	var pctStr = pct + "%";
	getElem("meter").setAttribute("width", pctStr);
	var title = getElem("progress_title");
	while (title.firstChild) title.removeChild(title.firstChild);
	title.appendChild(document.createTextNode(parseInt(pct)+"%"));
	// fade it out as it approaches finish
	title.setAttribute("fill-opacity", (pct > 80) ? ((100-pct)*5)/100 : 1);
}

// attempts to read the file that the user has chosen
function getFile(evt) {
	var inp = evt.target;
	var filelist = inp.files;
	if (filelist.length == 1) {
		var reader = new FileReader();
		reader.onloadend = function(e) {
		
			// try to unzip it in a worker thread
			var start = (new Date).getTime();
			var worker = new Worker("unzip.js");

			// this is the function that the worker thread uses to post progress/status
			worker.onmessage = function(event) {
				// if thread returned a Progress Report, then time to update
				if (typeof event.data == typeof {}) {
					var progress = event.data;
					if (progress.isValid) {
						var zipFiles = progress.zipLocalFiles;
						setProgressMeter(progress.totalBytesUnzipped / progress.totalSizeInBytes);
						if (zipFiles && zipFiles.length > 0) {
							// convert ZipLocalFiles into a bunch of ImageFiles
							for (f in zipFiles) {
								var zip = zipFiles[f];
								// add any new pages based on the filename
								if (zip.isValid && imageFilenames.indexOf(zip.filename) == -1) {
									imageFilenames.push(zip.filename);
									imageFiles.push(new ImageFile(zip.filename, zip.fileData));
								}
							}
							
							// hide logo
							getElem("logo").setAttribute("style", "display:none");
							
							// display nav
							getElem("nav").className = "";
							
							// display first page if we haven't yet
							if (currentImage == -1) {
								currentImage = 0;
								updatePage();
							}
	
							var counter = getElem("pageCounter");
							counter.removeChild(counter.firstChild);
							counter.appendChild(document.createTextNode("Page " + (currentImage+1) + "/" + imageFiles.length));
							
							if (progress.isDone) {
								var diff = ((new Date).getTime() - start)/1000;
								console.log("Unzipping done in " + diff + "s");
							}
						}
						else {
							getElem("logo").setAttribute("style", "display:block");
						}
					}
				}
				// A string was returned from the thread, just log it
				else if (typeof event.data == typeof "") {
					console.log( event.data );
				}
				
			};
			// error handler for worker thread
			worker.onerror = function(error) {
				console.log("Worker error: " + error.message);
				throw error;
			};
			
			currentImage = -1;
			imageFiles = [];
			imageFileNames = [];
			
			// send the binary string to the worker for unzipping
			worker.postMessage(e.target.result);
		};
		reader.readAsBinaryString(filelist[0]);
	}
}

function updatePage() {
	var counter = getElem("pageCounter");
	counter.removeChild(counter.firstChild);
	counter.appendChild(document.createTextNode("Page " + (currentImage+1) + "/" + imageFiles.length));
	
	if (imageFiles[currentImage])
		getElem("mainImage").setAttribute("src", imageFiles[currentImage].dataURI);
}

function showPrevPage() {
	currentImage--;
	if (currentImage < 0) currentImage = imageFiles.length - 1;
	updatePage();
	getElem("prev").focus();
}

function showNextPage() {
	currentImage++;
	if (currentImage >= imageFiles.length) currentImage = 0;
	updatePage();
	getElem("next").focus();
}

// TODO: fix it. not quite working yet
function rotateLeft() {
	var c = getElem("canvas"),
		ctx = c.getContext("2d"),
		img = getElem("mainImage");
	
	// reset image to default raster resolution
	img.setAttribute("width", "");
	
	// get max dimension and size the canvas accordingly
	var max = Math.max(img.width, img.height);
	c.setAttribute("width", max);
	c.setAttribute("height", max);

	ctx.translate(max/2,max/2);
	ctx.rotate(-90*Math.PI/180);
	ctx.translate(-max/2,-max/2);
	
	ctx.drawImage(img, 0, 0);

	img.setAttribute("width", "100%");
	img.setAttribute("src", c.toDataURL());
}

// TODO: implement
function rotateRight() {
	var c = getElem("canvas");
}

function closeBook() {
	currentImage = -1;
	imageFiles = [];
	imageFileNames = [];

	// clear img
	getElem("mainImage").setAttribute("src", null);
	
	// clear file upload
	resetFileUploader();
	
	// display logo
	getElem("logo").setAttribute("style", "display:block");
	
	// hide nav
	getElem("nav").className = "hide";
}

function keyUp(evt) {
	var code = evt.keyCode;
	switch(code) {
		case Key.LEFT:
			showPrevPage();
			break;
		case Key.RIGHT:
			showNextPage();
			break;
		case Key.L:
			rotateLeft();
			break;
		case Key.R:
			rotateRight();
			break;
		default:
//			console.log("KeyCode = " + code);
			break;
	}
}

// attaches a change event listener to the file input control
function init() {
	if (!window.FileReader) {
		alert("Sorry, kthoom will not work with your browser because it does not support the File API.  Please try kthoom with Firefox 3.6+.");
	}
	else {
		initProgressMeter();
		
		resetFileUploader();
		
		// add key handler
		document.addEventListener("keyup", keyUp, false);
	}
}

var Utils = {

	// This code was written by Tyler Akins and has been placed in the
	// public domain.  It would be nice if you left this header intact.
	// Base64 code from Tyler Akins -- http://rumkin.com

	// schiller: Removed string concatenation in favour of Array.join() optimization,
	//           also precalculate the size of the array needed.

	"_keyStr" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

	"encode64" : function(input) {
		if(window.btoa) return window.btoa(input); // Use native if available
		// base64 strings are 4/3 larger than the original string
		var output = new Array( Math.floor( (input.length + 2) / 3 ) * 4 );
		var chr1, chr2, chr3;
		var enc1, enc2, enc3, enc4;
		var i = 0, p = 0;

		do {
			chr1 = input.charCodeAt(i++);
			chr2 = input.charCodeAt(i++);
			chr3 = input.charCodeAt(i++);

			enc1 = chr1 >> 2;
			enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
			enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
			enc4 = chr3 & 63;

			if (isNaN(chr2)) {
				enc3 = enc4 = 64;
			} else if (isNaN(chr3)) {
				enc4 = 64;
			}

			output[p++] = this._keyStr.charAt(enc1);
			output[p++] = this._keyStr.charAt(enc2);
			output[p++] = this._keyStr.charAt(enc3);
			output[p++] = this._keyStr.charAt(enc4);
		} while (i < input.length);

		return output.join('');
	}
};
