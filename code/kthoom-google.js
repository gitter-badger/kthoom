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

kthoom.google = {

  apiKey: 'AIzaSyApRwQ3x622fi29dZsn4DD98FqYax9dBHY',
  clientId: '652854531961-pqkhcpcgqda9ag1b9p5gub0vv8f554q0.apps.googleusercontent.com',
  authed: false,
  oathToken: undefined,

  boot: function() {
    if (typeof gapi !== "undefined") {
      gapi.client.setApiKey(kthoom.google.apiKey);
      window.setTimeout(function() {
          kthoom.google.authorize(true /* immediate */, function() {});
      }, 1);
    }
  },

  authorize: function(immediate, callbackFn) {
    gapi.auth.authorize({
      'client_id': kthoom.google.clientId,
      'immediate': immediate,
      'response_type': 'token',
      'scope': [
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/drive'
      ]
    }, function(result) {
      // If we authenticated, then load the Drive API and after that,
      // call the callback function.
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
    });
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
          myHeaders.append('Authorization', 'OAuth ' + kthoom.google.oathToken);
          const myInit = {
            method: 'GET',
            headers: myHeaders,
            mode: 'cors',
            cache: 'default',
          };

          kthoom.getApp().loadSingleBookFromFetch(bookName, bookUrl, myInit, fullSize);
        } catch (e) {
          if (typeof e === 'string' && e.startsWith('No browser support')) {
            console.log(e);

            const xhr = new XMLHttpRequest();
            xhr.open('GET', bookUrl, true);
            xhr.setRequestHeader('Authorization', 'OAuth ' + kthoom.google.oathToken);
            kthoom.getApp().loadSingleBookFromXHR(bookName, xhr, fullSize);
          }
        }
      });
    }
  },
};
