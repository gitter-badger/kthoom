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
      kthoom.setProgressMeter(0.1, 'Loading code for IPFS...');
      kthoom.ipfs.nodePromise_ = new Promise((resolve, reject) => {
        // Load in the IPFS script API.
        var ipfsScriptEl = document.createElement('script');
        ipfsScriptEl.addEventListener('load', () => {
          kthoom.setProgressMeter(0.2, 'Creating IPFS node...');
          var node = window.Ipfs.createNode();
          node.on('start', () => {
            kthoom.ipfs.node_ = node;
            resolve(node);
          });
        });
        ipfsScriptEl.setAttribute('src', 'https://unpkg.com/ipfs@0.27.5/dist/index.min.js');
        document.body.appendChild(ipfsScriptEl);
      });
    }
    return kthoom.ipfs.nodePromise_;
  },
  loadHash: function(ipfshash) {
    kthoom.ipfs.getNode().then(node => {
      kthoom.setProgressMeter(0.3, 'Fetching data from IPFS...');
      node.files.cat(ipfshash, (err, data) => {
        if (err) throw err;

        // TODO: The API says this will be a Buffer, but I'm seeing an Uint8Array.
        if (data instanceof Uint8Array) {
          loadFromArrayBuffer(data.buffer);
        }
      });  
    });
  },
  ipfsHashWindow: function() {
    var ipfshash = window.prompt("Please Enter The IPFS hash of the book");
    kthoom.ipfs.loadHash(ipfshash);
  },
};