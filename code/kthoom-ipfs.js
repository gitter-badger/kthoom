/**
 * Code for handling file access through IPFS.
 */

if (window.kthoom === undefined) {
  window.kthoom = {};
}

kthoom.ipfs = {
  node: null,
  loadHash: function(ipfshash) {
    if (!kthoom.ipfs.node) {
      kthoom.ipfs.node = window.Ipfs.createNode();
    }

    var node = kthoom.ipfs.node;
    node.on('start', () => {
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