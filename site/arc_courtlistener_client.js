// Browser-side CourtListener client. Contains NO API key: every call goes to the
// secure ARC Worker at /legal-api/*, which holds the provider credential server-side.
(function () {
'use strict';

var BASE = (window.ARC_LEGAL_API_BASE || '/legal-api');

async function call(path, opts) {
  opts = opts || {};
  var init = { method: opts.method || 'GET', credentials: 'include', headers: {} };
  if (opts.body) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  var r = await fetch(BASE + path, init);
  var data;
  try { data = await r.json(); } catch (e) { data = { error: 'Unexpected response from the legal service.' }; }
  if (!r.ok && r.status !== 409) { var err = new Error(data.error || 'Request failed'); err.status = r.status; err.payload = data; throw err; }
  if (r.status === 409) { data.duplicate = true; }
  return data;
}

window.ARCCourtListener = {
  api: call,

  courts: function () { return call('/courts'); },

  // Docket numbers are not unique: a docket-number search must carry a court
  // or jurisdiction filter. The Worker enforces this too.
  search: function (params) {
    if (params.docketNumber && !params.court && !params.jurisdiction) {
      return Promise.reject(new Error('Docket-number searches need a court or jurisdiction filter.'));
    }
    return call('/search', { method: 'POST', body: params });
  },

  docket: function (id) { return call('/dockets/' + encodeURIComponent(id)); },

  // CourtListener opinion-page URLs carry the CLUSTER id, not the opinion id.
  cluster: function (id, full) { return call('/clusters/' + encodeURIComponent(id) + (full ? '?full=1' : '')); },
  opinion: function (id) { return call('/opinions/' + encodeURIComponent(id)); },

  /** Accepts a CourtListener opinion URL and returns the cluster id it encodes. */
  clusterIdFromUrl: function (url) {
    var m = String(url || '').match(/courtlistener\.com\/opinion\/(\d+)/);
    return m ? m[1] : '';
  },

  importAuthority: function (payload) { return call('/import-authority', { method: 'POST', body: payload }); },
  verifyAuthority: function (payload) { return call('/verify-authority', { method: 'POST', body: payload }); },
  listAuthorities: function (caseId) { return call('/authorities/' + encodeURIComponent(caseId)); }
};
})();
