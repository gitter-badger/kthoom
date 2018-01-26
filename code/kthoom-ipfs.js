/**
 * kthoom-ipfs.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

/**
 * Code for handling file access through IPFS.
 */

if (window.kthoom === undefined) {
  window.kthoom = {};
}

kthoom.ipfs = {
  nodePromise_: undefined,
  node_: undefined,
  getNode: function() {
    if (!kthoom.ipfs.nodePromise_) {
      kthoom.getApp().setProgressMeter({loadPct: 0.1, label: 'Loading code for IPFS...'});
      kthoom.ipfs.nodePromise_ = new Promise((resolve, reject) => {
        // Load in the IPFS script API.
        const ipfsScriptEl = document.createElement('script');
        ipfsScriptEl.addEventListener('load', () => {
          kthoom.getApp().setProgressMeter({loadPct: 0.2, label: 'Creating IPFS node...'});
          const node = window.Ipfs.createNode();
          node.on('start', () => {
            kthoom.ipfs.node_ = node;
            resolve(node);
          });
        });
        ipfsScriptEl.setAttribute('src', 'https://unpkg.com/ipfs@0.27.5/dist/index.js');
        document.body.appendChild(ipfsScriptEl);
      });
    }
    return kthoom.ipfs.nodePromise_;
  },
  loadHash: function(ipfshash) {
    kthoom.ipfs.getNode().then(node => {
      kthoom.getApp().setProgressMeter({loadPct: 0.3, label: 'Fetching data from IPFS...'});
      node.files.cat(ipfshash, (err, data) => {
        if (err) throw err;

        // TODO: The API says this will be a Buffer, but I'm seeing an Uint8Array.
        if (data instanceof Uint8Array) {
          kthoom.getApp().loadSingleBookFromArrayBuffer(ipfshash, data.buffer);
        }
      });  
    });
  },
  ipfsHashWindow: function() {
    const ipfshash = window.prompt("Please Enter The IPFS hash of the book");
    kthoom.ipfs.loadHash(ipfshash);
  },
};