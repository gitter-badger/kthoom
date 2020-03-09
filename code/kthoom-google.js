/**
 * kthoom-google.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */
/**
 * Code for handling file access through Google Drive.
 */

if (window.kthoom == undefined) {
  window.kthoom = {};
}

let openMenu;

function defineGoogleHooks() {
  // TODO: Turn this script into a module and remove most things from window.kthoom.google.
  window.kthoom.google = {
    authed: false,
    oathToken: undefined,

    boot: function() {
      if (typeof gapi !== 'undefined') {
        gapi.load('client', () => {
          gapi.client.init({
            'apiKey': window.kthoom.google.apiKey,
            'clientId': window.kthoom.google.clientId,
            'scope': [
              'https://www.googleapis.com/auth/userinfo.email',
              'https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/drive'
            ].join(' '),
          }).then(() => {
            kthoom.google.authorize(true, () => {
              openMenu.showMenuItem('menu-open-google-drive', true);
            });
          });
        });
      }
    },

    authorize: function(immediate, callbackFn) {
      // If we authenticated, then load the Drive and Picker APIs and after that,
      // call the callback function.
      const result = gapi.client.getToken();
      if (result && !result.error) {
        kthoom.google.oathToken = result.access_token;
        kthoom.google.authed = true;
        gapi.client.load('drive', 'v2', function() {
          gapi.load('picker', callbackFn);
        });
      } else {
        // Else, if we are not Google authenticated, and this was immediate, then
        // just do the callback.  Otherwise, we've failed horribly so die.
        if (immediate) {
          callbackFn();
        } else {
          alert('There was a problem authenticating with Google.  ' +
              'Please try again later.');
        }
      }
    },

    doDrive: function() {
      if (!kthoom.google.authed) {
        kthoom.google.authorize(false /* immediate */, kthoom.google.doDrive);
      } else {
        const docsView = new google.picker.DocsView();
        docsView.setMode(google.picker.DocsViewMode.LIST);
        docsView.setQuery('*.cbr|*.cbz|*.cbt');
        const picker = new google.picker.PickerBuilder().
            addView(docsView).
            // Enable this feature when we can efficiently get downloadUrls
            // for each file selected (right now we'd have to do drive.get
            // calls for each file which is annoying the way we have set up
            // library.allBooks).
            //enableFeature(google.picker.Feature.MULTISELECT_ENABLED).
            enableFeature(google.picker.Feature.NAV_HIDDEN).
            setOAuthToken(kthoom.google.oathToken).
            setDeveloperKey(kthoom.google.apiKey).
            setAppId(kthoom.google.clientId).
            setCallback(kthoom.google.pickerCallback).
            build();
        picker.setVisible(true);
      }
    },

    pickerCallback : function(data) {
      if (data.action == google.picker.Action.PICKED) {
        const fullSize = data.docs[0].sizeBytes;
        const gRequest = gapi.client.drive.files.get({
            'fileId': data.docs[0].id,
        });
        gRequest.execute(function(response) {
          const bookName = data.docs[0].name;
          const bookUrl = response.downloadUrl;
          // Try to download using fetch, otherwise use XHR.
          try {
            const myHeaders = new Headers();
            debugger;
            myHeaders.append('Authorization', 'OAuth ' + kthoom.google.oathToken);
            myHeaders.append('Origin', window.location.origin);
            const myInit = {
              method: 'GET',
              headers: myHeaders,
              mode: 'cors',
              cache: 'default',
            };

            kthoom.getApp().loadSingleBookFromFetch(bookName, bookUrl, fullSize, myInit);
          } catch (e) {
            if (typeof e === 'string' && e.startsWith('No browser support')) {
              kthoom.getApp().loadSingleBookFromXHR(bookName, bookUrl, fullSize, {
                'Authorization': ('OAuth ' + kthoom.google.oathToken),
              });
            }
          }
        });
      }
    },
  };
}

(async function() {
  try {
    // Wait for everything to be loaded.
    await new Promise((resolve, reject) => {
      window.addEventListener('load', () => resolve());
    });

    // Load the Google API key if it exists.
    const gkey = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'gkey.json', true);
      xhr.responseType = 'json';
      xhr.onload = (evt) => {
        if (evt.target.status !== 200) {
          reject('gkey.json not found');
        }
        resolve(evt.target.response);
      };
      xhr.onerror = err => reject(err);
      xhr.send(null);
    });

    if (!gkey['apiKey'] || !gkey['clientId']) {
      throw 'No API key or client ID found in gkey.json';
    }

    const app = kthoom.getApp();
    if (!app) {
      throw 'No kthoom app instance found';
    }

    openMenu = app.getMenu('open');
    if (!openMenu) {
      throw 'No Open menu found in the kthoom app';
    }

    // If we get here, we know the hosted kthoom instance has a Google API Key and we need to
    // prepare to load and execute the Google API stuff and show the menu item.

    defineGoogleHooks();
    window.kthoom.google.apiKey = gkey['apiKey'];
    window.kthoom.google.clientId = gkey['clientId'];

    // Load the Google API script.
    await new Promise((resolve, reject) => {
      // If we cannot load the Google API script, then die.
      const gScript = document.createElement('script');
      gScript.onerror = err => reject(err);
      gScript.onload = () => resolve();
      gScript.setAttribute('src', 'https://apis.google.com/js/platform.js');
      document.body.appendChild(gScript);
    });

    window.kthoom.google.boot();

  } catch (err) {
    // Die.
    console.warn(`Google integration was not found: ${err}`);
  }
})();
