const cacheName = 'kthoom';
let urlsToCache = [
  '.',
  'code/bitjs/archive/archive.js',
  'code/bitjs/archive/rarvm.js',
  'code/bitjs/archive/unzip.js',
  'code/bitjs/archive/unrar.js',
  'code/bitjs/archive/untar.js',
  'code/bitjs/file/sniffer.js',
  'code/bitjs/image/webp-shim/webp-shim.js',
  'code/bitjs/image/webp-shim/webp-shim-module.js',
  'code/bitjs/image/webp-shim/webp-shim-module.wasm',
  'code/bitjs/image/io/bitstream.js',
  'code/bitjs/image/io/bytebuffer.js',
  'code/bitjs/image/io/bytestream.js',
  'code/book-binder.js',
  'code/book-events.js',
  'code/book-viewer.js',
  'code/book.js',
  'code/comic-book-binder.js',
  'code/epub-book-binder.js',
  'code/event-emitter.js',
  'code/helpers.js',
  'code/kthoom-google.js',
  'code/kthoom-ipfs.js',
  'code/kthoom.css',
  'code/kthoom.js',
  'code/menu.js',
  'code/page.js',
  'code/reading-stack.js',
  'code/traceur/traceur.js',
  'images/logo-192.png',
  'images/logo.png',
  'images/logo.svg',
  'index.html',
  'privacy.html',
  'kthoom.webmanifest',
  'service-worker.js'
];

self.addEventListener('install', async event => {
  event.waitUntil(
    caches.open(cacheName)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', async e => {
  e.respondWith(
    caches.match(e.request).then((r) => {
      return r || fetch(e.request).then((response) => {
        return caches.open(cacheName).then((cache) => {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    })
  );
});