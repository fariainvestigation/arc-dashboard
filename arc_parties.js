/* ARC Parties Involved, mounted as a Case Intelligence stage.
   Extracted from the standalone arc_parties.html. Changes on import:
   the case id is taken from arc_unified_bridge.js instead of a free-text
   box, the DEMO-CASE fallback is gone, and the two seed-data generators
   were removed so demonstration parties cannot reach production. */

(function(){
  'use strict';

  /* ============================================================
     ARC PARTIES INVOLVED
     Single file module. No build step. No external JS.
     Storage: IndexedDB arc_parties_db v1
     Stores: parties (keyPath id, index caseId), extractions (keyPath id, index caseId)
     ============================================================ */

  var DB_NAME = 'arc_parties_db';
  var DB_VER = 1;
  var db = null;
  var state = {
    caseId: '',
    view: 'roster',
    filter: 'ALL',
    search: '',
    parties: [],
    extractions: [],
    current: null,
    tab: 'overview',
    editing: null,
    mergePair: null,
    mergeChoice: {},
    queueFilter: 'ALL'
  };

  /* ---------- role taxonomy ---------- */
  var ROLES = [
    { id:'CLIENT',              label:'Client',               group:'DEFENSE' },
    { id:'DEFENDANT',           label:'Defendant',            group:'DEFENSE' },
    { id:'CO_DEFENDANT',        label:'Co-Defendant',         group:'DEFENSE' },
    { id:'COMPLAINING_WITNESS', label:'Complaining Witness',  group:'WITNESS' },
    { id:'CIVILIAN_WITNESS',    label:'Civilian Witness',     group:'WITNESS' },
    { id:'POLICE_OFFICER',      label:'Police Officer',       group:'LE' },
    { id:'DETECTIVE',           label:'Detective',            group:'LE' },
    { id:'EXPERT',              label:'Expert',               group:'OTHER' },
    { id:'CUSTODIAN_OF_RECORDS',label:'Custodian of Records', group:'OTHER' },
    { id:'PROSECUTOR',          label:'Prosecutor',           group:'COURT' },
    { id:'DEFENSE_COUNSEL',     label:'Defense Counsel',      group:'COURT' },
    { id:'JUDGE',               label:'Judge',                group:'COURT' },
    { id:'PROBATION',           label:'Probation',            group:'COURT' },
    { id:'FAMILY',              label:'Family',               group:'OTHER' },
    { id:'INTERPRETER',         label:'Interpreter',          group:'OTHER' },
    { id:'OTHER',               label:'Other',                group:'OTHER' }
  ];

  var INTERVIEW_STATES = ['NOT CONTACTED','ATTEMPTED','SCHEDULED','COMPLETED','DECLINED','UNAVAILABLE'];
  var CONTACT_METHODS  = ['Phone','Email','Mail','In Person','Text','Third Party'];
  var CONTACT_OUTCOMES = ['No Answer','Left Message','Spoke','Refused','Wrong Number','Scheduled','Completed'];

  /* Fields never included in AI payloads or standard exports.
     Reversible via state flags below if you decide otherwise. */
  var RESTRICTED_FIELDS = ['dob','address','city','zip','phone','email','ssnLast4'];
  var WORK_PRODUCT_FIELDS = ['credibility','safetyRisks','vulnerabilities','strategyNotes'];
  var ALLOW_PII_TO_AI = false;
  var ALLOW_WORKPRODUCT_EXPORT = false;

  /* ---------- utilities ---------- */
  function $(id){ return document.getElementById(id); }
  function esc(s){
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function uid(prefix){
    var t = Date.now().toString(36).toUpperCase();
    var r = Math.random().toString(36).slice(2,6).toUpperCase();
    return (prefix || 'P') + '-' + t + '-' + r;
  }
  function nowISO(){ return new Date().toISOString(); }
  function fmtDate(iso){
    if (!iso) return 'Not listed';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toISOString().slice(0,10);
  }
  function toast(msg){
    var host = $('arcToast');
    var el = document.createElement('div');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 3600);
  }
  function roleLabel(id){
    for (var i=0;i<ROLES.length;i++){ if (ROLES[i].id === id) return ROLES[i].label; }
    return id || 'Unassigned';
  }
  function roleGroup(id){
    for (var i=0;i<ROLES.length;i++){ if (ROLES[i].id === id) return ROLES[i].group; }
    return 'OTHER';
  }
  function roleTagClass(id){
    if (id === 'DEFENDANT' || id === 'CO_DEFENDANT' || id === 'CLIENT') return 'def';
    if (id === 'COMPLAINING_WITNESS') return 'cw';
    if (id === 'CIVILIAN_WITNESS') return 'wit';
    if (roleGroup(id) === 'LE') return 'le';
    return '';
  }
  function fullName(p){
    var parts = [p.firstName, p.middleName, p.lastName].filter(Boolean);
    var n = parts.join(' ').trim();
    if (p.suffix && p.suffix !== 'None') n += ' ' + p.suffix;
    return n || 'Unnamed Party';
  }
  function ageFrom(dob){
    if (!dob) return null;
    var d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    var t = new Date();
    var a = t.getFullYear() - d.getFullYear();
    var m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
    return a;
  }
  function isMinor(p){
    if (p.minorFlag) return true;
    var a = ageFrom(p.dob);
    return a !== null && a < 18;
  }
  function normName(s){
    return String(s || '').toLowerCase().replace(/[^a-z ]/g,'').replace(/\s+/g,' ').trim();
  }
  function nameSimilarity(a, b){
    var A = normName(a).split(' ').filter(Boolean);
    var B = normName(b).split(' ').filter(Boolean);
    if (!A.length || !B.length) return 0;
    var hits = 0;
    for (var i=0;i<A.length;i++){ if (B.indexOf(A[i]) !== -1) hits++; }
    return Math.round((hits * 2 / (A.length + B.length)) * 100);
  }

  /* ---------- indexeddb ---------- */
  function openDB(){
    return new Promise(function(resolve, reject){
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e){
        var d = e.target.result;
        if (!d.objectStoreNames.contains('parties')){
          var s1 = d.createObjectStore('parties', { keyPath:'id' });
          s1.createIndex('caseId','caseId',{ unique:false });
        }
        if (!d.objectStoreNames.contains('extractions')){
          var s2 = d.createObjectStore('extractions', { keyPath:'id' });
          s2.createIndex('caseId','caseId',{ unique:false });
        }
      };
      req.onsuccess = function(e){ resolve(e.target.result); };
      req.onerror = function(e){ reject(e.target.error); };
    });
  }
  function txStore(store, mode){
    return db.transaction(store, mode).objectStore(store);
  }
  function putRec(store, rec){
    return new Promise(function(resolve, reject){
      var r = txStore(store,'readwrite').put(rec);
      r.onsuccess = function(){ resolve(rec); };
      r.onerror = function(e){ reject(e.target.error); };
    });
  }
  function delRec(store, id){
    return new Promise(function(resolve, reject){
      var r = txStore(store,'readwrite').delete(id);
      r.onsuccess = function(){ resolve(true); };
      r.onerror = function(e){ reject(e.target.error); };
    });
  }
  function listByCase(store, caseId){
    return new Promise(function(resolve, reject){
      var out = [];
      var idx = txStore(store,'readonly').index('caseId');
      var r = idx.openCursor(IDBKeyRange.only(caseId));
      r.onsuccess = function(e){
        var c = e.target.result;
        if (c){ out.push(c.value); c.continue(); } else { resolve(out); }
      };
      r.onerror = function(e){ reject(e.target.error); };
    });
  }

  function reload(){
    return Promise.all([
      listByCase('parties', state.caseId),
      listByCase('extractions', state.caseId)
    ]).then(function(res){
      state.parties = res[0].sort(function(a,b){ return fullName(a).localeCompare(fullName(b)); });
      state.extractions = res[1];
      render();
    });
  }

  /* ---------- record factory ---------- */
  function blankParty(){
    return {
      id: uid('P'),
      caseId: state.caseId,
      firmPersonId: '',
      firstName:'', middleName:'', lastName:'', suffix:'', aliases:'',
      dob:'', gender:'', minorFlag:false, guardianName:'', guardianPhone:'',
      phone:'', altPhone:'', email:'', address:'', city:'', state:'MA', zip:'',
      preferredContact:'Phone', language:'English', interpreterNeeded:false,
      primaryRole:'', secondaryRoles:'', priority:'LOW',
      involvement:'', interviewStatus:'NOT CONTACTED', attorneyContact:'',
      employer:'', occupation:'',
      badgeNumber:'', department:'', unit:'', leRank:'',
      credibility:'', safetyRisks:'', vulnerabilities:'', strategyNotes:'',
      contactAttempts:[], statements:[], notes:[], relationships:[],
      linkedDocs:[], linkedEvidence:[],
      source:'MANUAL', confidence:null,
      createdAt: nowISO(), updatedAt: nowISO()
    };
  }

  /* ---------- filtering ---------- */
  function filteredParties(){
    var q = state.search.toLowerCase().trim();
    return state.parties.filter(function(p){
      var f = state.filter;
      var ok = true;
      if (f === 'DEFENDANT') ok = (p.primaryRole === 'DEFENDANT' || p.primaryRole === 'CLIENT');
      else if (f === 'CO_DEFENDANT') ok = p.primaryRole === 'CO_DEFENDANT';
      else if (f === 'COMPLAINING_WITNESS') ok = p.primaryRole === 'COMPLAINING_WITNESS';
      else if (f === 'CIVILIAN_WITNESS') ok = p.primaryRole === 'CIVILIAN_WITNESS';
      else if (f === 'LE') ok = roleGroup(p.primaryRole) === 'LE';
      else if (f === 'OTHER') ok = ['OTHER','EXPERT','CUSTODIAN_OF_RECORDS','FAMILY','INTERPRETER'].indexOf(p.primaryRole) !== -1;
      if (!ok) return false;
      if (!q) return true;
      var hay = (fullName(p) + ' ' + p.aliases + ' ' + p.id + ' ' + p.badgeNumber + ' ' + p.department).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function counts(){
    var c = { total:0, defendants:0, witnesses:0, complaining:0, le:0, pending:0, minors:0 };
    state.parties.forEach(function(p){
      c.total++;
      var g = roleGroup(p.primaryRole);
      if (p.primaryRole === 'DEFENDANT' || p.primaryRole === 'CO_DEFENDANT' || p.primaryRole === 'CLIENT') c.defendants++;
      if (g === 'WITNESS') c.witnesses++;
      if (p.primaryRole === 'COMPLAINING_WITNESS') c.complaining++;
      if (g === 'LE') c.le++;
      if (['NOT CONTACTED','ATTEMPTED','SCHEDULED'].indexOf(p.interviewStatus) !== -1) c.pending++;
      if (isMinor(p)) c.minors++;
    });
    return c;
  }

  /* ---------- render: roster ---------- */
  function renderRoster(){
    var c = counts();
    var rows = filteredParties();
    var h = '';

    h += '<div class="metrics">';
    h += metricCard('Total Parties', c.total, '');
    h += metricCard('Defendants', c.defendants, 'var(--arc-red)');
    h += metricCard('Witnesses', c.witnesses, 'var(--arc-blue)');
    h += metricCard('Complaining', c.complaining, 'var(--arc-gold)');
    h += metricCard('Law Enforcement', c.le, 'var(--arc-line-2)');
    h += '<div class="metric hi"><div class="lab">Interviews Pending</div><div class="val">' + c.pending + '</div></div>';
    h += '</div>';

    h += '<div class="row" style="margin-bottom:14px">';
    h += chip('ALL','All') + chip('DEFENDANT','Defendant') + chip('CO_DEFENDANT','Co-Defendant');
    h += chip('COMPLAINING_WITNESS','Complaining Witness') + chip('CIVILIAN_WITNESS','Civilian Witness');
    h += chip('LE','Law Enforcement') + chip('OTHER','Other');
    h += '<div class="spacer"></div>';
    h += '<input type="text" id="searchBox" placeholder="Search name, ID, badge" style="width:210px" value="' + esc(state.search) + '">';
    h += '<button class="btn primary" id="btnAdd">+ Add New Person</button>';
    h += '</div>';

    if (!rows.length){
      // Real empty state. The sample-roster buttons were removed with the seed
      // generators so demonstration parties cannot be created in production.
      h += '<div class="empty">' + (state.caseId
        ? 'No parties recorded for this matter yet. Use Add Party to start the roster.'
        : 'Open a case to view its parties.') + '</div>';
    } else {
      h += '<div style="overflow-x:auto"><table><thead><tr>' +
           '<th>Name / ID</th><th>Role</th><th>Contact</th><th>Interview</th>' +
           '<th>Last Contact</th><th>Priority</th><th></th></tr></thead><tbody>';
      rows.forEach(function(p){
        var last = p.contactAttempts && p.contactAttempts.length
          ? fmtDate(p.contactAttempts[p.contactAttempts.length-1].date) : 'Not listed';
        h += '<tr>';
        h += '<td><div class="nm">' + esc(fullName(p)) + (isMinor(p) ? ' <span class="tag minor">Minor</span>' : '') +
             '</div><div class="pid">ID: ' + esc(p.id) + '</div></td>';
        h += '<td><span class="tag ' + roleTagClass(p.primaryRole) + '">' + esc(roleLabel(p.primaryRole)) + '</span>';
        if (roleGroup(p.primaryRole) === 'LE' && p.badgeNumber){
          h += '<div class="pid">Badge ' + esc(p.badgeNumber) + '</div>';
        }
        h += '</td>';
        h += '<td class="mono" style="font-size:12px">' + esc(p.phone || 'Not listed') + '</td>';
        h += '<td class="tech" style="color:var(--arc-text-dim)">' + esc(p.interviewStatus) + '</td>';
        h += '<td class="mono" style="font-size:12px">' + esc(last) + '</td>';
        h += '<td class="pri-' + esc(p.priority) + ' tech">' + esc(p.priority) + '</td>';
        h += '<td><button class="btn sm openBtn" data-id="' + esc(p.id) + '">Open</button></td>';
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }

    $('viewRoster').innerHTML = h;

    var sb = $('searchBox');
    if (sb){
      sb.addEventListener('input', function(){
        state.search = this.value;
        var pos = this.selectionStart;
        renderRoster();
        var nb = $('searchBox');
        if (nb){ nb.focus(); nb.setSelectionRange(pos, pos); }
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#viewRoster .chip'), function(b){
      b.addEventListener('click', function(){ state.filter = this.getAttribute('data-f'); renderRoster(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#viewRoster .openBtn'), function(b){
      b.addEventListener('click', function(){ openProfile(this.getAttribute('data-id')); });
    });
    if ($('btnAdd')) $('btnAdd').addEventListener('click', function(){ openForm(null); });
  }

  function metricCard(lab, val, accent){
    return '<div class="metric">' + (accent ? '<span class="accent" style="background:' + accent + '"></span>' : '') +
           '<div class="lab">' + esc(lab) + '</div><div class="val">' + val + '</div></div>';
  }
  function chip(id, label){
    return '<button class="chip' + (state.filter === id ? ' on' : '') + '" data-f="' + id + '">' + esc(label) + '</button>';
  }

  /* ---------- render: form ---------- */
  function openForm(id){
    state.editing = id ? JSON.parse(JSON.stringify(findParty(id))) : blankParty();
    state.view = 'form';
    render();
  }
  function findParty(id){
    for (var i=0;i<state.parties.length;i++){ if (state.parties[i].id === id) return state.parties[i]; }
    return null;
  }

  function renderForm(){
    var p = state.editing;
    var isLE = roleGroup(p.primaryRole) === 'LE';
    var h = '';

    h += '<div class="row" style="margin-bottom:14px">';
    h += '<button class="btn" id="fBack">Back</button><div class="spacer"></div>';
    h += '<button class="btn" id="fCancel">Cancel</button>';
    h += '<button class="btn primary" id="fSave">Save Person</button>';
    h += '</div>';

    h += '<div class="formGrid"><div>';

    /* identity */
    h += sec('Basic Identity','SEC_01',
      '<div class="fg">' +
        fld('First Name','firstName',p.firstName) +
        fld('Middle Name','middleName',p.middleName) +
        fld('Last Name','lastName',p.lastName) +
        fld('Suffix','suffix',p.suffix) +
        '<div class="f full"><label>Known Aliases</label><input type="text" data-k="aliases" value="' + esc(p.aliases) + '" placeholder="Separate with commas"></div>' +
        '<div class="f"><label>Date of Birth</label><input type="date" data-k="dob" value="' + esc(p.dob) + '"></div>' +
        '<div class="f"><label>Gender</label><input type="text" data-k="gender" value="' + esc(p.gender) + '"></div>' +
        '<div class="f full"><div class="chkRow"><input type="checkbox" id="minorFlag" data-k="minorFlag"' + (p.minorFlag ? ' checked' : '') + '>' +
          '<label for="minorFlag" style="text-transform:none;letter-spacing:0;font-size:12px;color:var(--arc-text)">' +
          'Minor. Suppresses DOB and address from all generated letters and exports.</label></div></div>' +
        (p.minorFlag || isMinor(p) ?
          '<div class="f"><label>Guardian Name</label><input type="text" data-k="guardianName" value="' + esc(p.guardianName) + '"></div>' +
          '<div class="f"><label>Guardian Phone</label><input type="text" data-k="guardianPhone" value="' + esc(p.guardianPhone) + '"></div>' : '') +
      '</div>');

    /* contact */
    h += sec('Contact Information','SEC_02',
      '<div class="fg">' +
        fld('Primary Phone','phone',p.phone) +
        fld('Alternate Phone','altPhone',p.altPhone) +
        fld('Email','email',p.email) +
        '<div class="f full"><label>Physical Address</label><input type="text" data-k="address" value="' + esc(p.address) + '"></div>' +
        fld('City','city',p.city) + fld('State','state',p.state) + fld('ZIP','zip',p.zip) +
        '<div class="f"><label>Preferred Method</label>' + sel('preferredContact', CONTACT_METHODS, p.preferredContact) + '</div>' +
        fld('Primary Language','language',p.language) +
        '<div class="f full"><div class="chkRow"><input type="checkbox" id="interp" data-k="interpreterNeeded"' + (p.interpreterNeeded ? ' checked' : '') + '>' +
          '<label for="interp" style="text-transform:none;letter-spacing:0;font-size:12px;color:var(--arc-text)">Interpreter required for interview</label></div></div>' +
      '</div>');

    /* law enforcement */
    h += sec('Law Enforcement','SEC_05',
      (isLE ? '' : '<div class="hint" style="margin-bottom:12px">Applies when primary role is Police Officer or Detective.</div>') +
      '<div class="fg">' +
        fld('Badge Number','badgeNumber',p.badgeNumber) +
        fld('Department','department',p.department) +
        fld('Unit / Division','unit',p.unit) +
        fld('Rank','leRank',p.leRank) +
      '</div>');

    /* employment */
    h += sec('Professional','SEC_06',
      '<div class="fg">' + fld('Employer','employer',p.employer) + fld('Occupation','occupation',p.occupation) + '</div>');

    h += '</div><div>';

    /* role */
    h += sec('Role and Priority','SEC_03',
      '<div class="f" style="margin-bottom:14px"><label>Primary Role</label>' +
        selRoles('primaryRole', p.primaryRole) + '</div>' +
      '<div class="f" style="margin-bottom:14px"><label>Secondary Roles</label>' +
        '<input type="text" data-k="secondaryRoles" value="' + esc(p.secondaryRoles) + '" placeholder="e.g. Employee, Relative"></div>' +
      '<div class="f"><label>Priority</label><div class="segs" id="prioritySeg">' +
        ['LOW','MED','HIGH'].map(function(v){
          return '<button data-v="' + v + '" class="' + (p.priority === v ? 'on' : '') + '">' + v + '</button>';
        }).join('') + '</div></div>');

    /* involvement */
    h += sec('Case Involvement','SEC_04',
      '<div class="f" style="margin-bottom:14px"><label>Involvement Description</label>' +
        '<textarea data-k="involvement" placeholder="How this person relates to the matter">' + esc(p.involvement) + '</textarea></div>' +
      '<div class="f" style="margin-bottom:14px"><label>Interview Status</label>' + sel('interviewStatus', INTERVIEW_STATES, p.interviewStatus) + '</div>' +
      '<div class="f"><label>Represented By</label><input type="text" data-k="attorneyContact" value="' + esc(p.attorneyContact) + '" placeholder="Name or firm, if represented"></div>');

    /* work product */
    h += '<div class="sec"><div class="secHead"><span class="t">Investigation Assessment</span>' +
         '<button class="btn sm" id="wpToggle">Show</button></div>' +
         '<div class="secBody hidden" id="wpBody">' +
         '<div class="warn" style="margin-bottom:14px">Attorney work product. Excluded from exports, letters, and AI payloads by default.</div>' +
         '<div class="f" style="margin-bottom:12px"><label>Credibility</label><textarea data-k="credibility">' + esc(p.credibility) + '</textarea></div>' +
         '<div class="f" style="margin-bottom:12px"><label>Safety Risks</label><textarea data-k="safetyRisks">' + esc(p.safetyRisks) + '</textarea></div>' +
         '<div class="f" style="margin-bottom:12px"><label>Vulnerabilities</label><textarea data-k="vulnerabilities">' + esc(p.vulnerabilities) + '</textarea></div>' +
         '<div class="f"><label>Strategy Notes</label><textarea data-k="strategyNotes">' + esc(p.strategyNotes) + '</textarea></div>' +
         '</div></div>';

    h += '</div></div>';

    $('viewForm').innerHTML = h;
    bindFormInputs();
  }

  function sec(title, code, body){
    return '<div class="sec"><div class="secHead"><span class="t">' + esc(title) + '</span>' +
           '<span class="meta">' + esc(code) + '</span></div><div class="secBody">' + body + '</div></div>';
  }
  function fld(label, key, val){
    return '<div class="f"><label>' + esc(label) + '</label><input type="text" data-k="' + key + '" value="' + esc(val) + '"></div>';
  }
  function sel(key, opts, val){
    return '<select data-k="' + key + '">' + opts.map(function(o){
      return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('') + '</select>';
  }
  function selRoles(key, val){
    var h = '<select data-k="' + key + '"><option value="">Select primary role</option>';
    ROLES.forEach(function(r){
      h += '<option value="' + r.id + '"' + (r.id === val ? ' selected' : '') + '>' + esc(r.label) + '</option>';
    });
    return h + '</select>';
  }

  function bindFormInputs(){
    Array.prototype.forEach.call(document.querySelectorAll('#viewForm [data-k]'), function(el){
      var evt = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') ? 'change' : 'input';
      el.addEventListener(evt, function(){
        var k = this.getAttribute('data-k');
        state.editing[k] = (this.type === 'checkbox') ? this.checked : this.value;
        if (k === 'primaryRole' || k === 'minorFlag' || k === 'dob') renderForm();
      });
    });
    var seg = $('prioritySeg');
    if (seg){
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function(b){
        b.addEventListener('click', function(){ state.editing.priority = this.getAttribute('data-v'); renderForm(); });
      });
    }
    var wp = $('wpToggle');
    if (wp){
      wp.addEventListener('click', function(){
        var body = $('wpBody');
        body.classList.toggle('hidden');
        this.textContent = body.classList.contains('hidden') ? 'Show' : 'Hide';
      });
    }
    $('fSave').addEventListener('click', saveForm);
    $('fCancel').addEventListener('click', function(){ state.view = 'roster'; render(); });
    $('fBack').addEventListener('click', function(){ state.view = 'roster'; render(); });
  }

  function saveForm(){
    var p = state.editing;
    if (!p.firstName && !p.lastName){ toast('A first or last name is required.'); return; }
    if (!p.primaryRole){ toast('Select a primary role.'); return; }
    p.updatedAt = nowISO();
    p.caseId = state.caseId;
    putRec('parties', p).then(function(){
      toast('Saved ' + fullName(p));
      state.view = 'roster';
      state.editing = null;
      return reload();
    });
  }

  /* ---------- render: profile ---------- */
  function openProfile(id){
    state.current = findParty(id);
    state.view = 'profile';
    state.tab = 'overview';
    render();
  }

  var TABS = [
    ['overview','Overview'], ['contact','Contact'], ['attempts','Contact Attempts'],
    ['interviews','Interviews'], ['statements','Statements'], ['relationships','Relationships'],
    ['links','Reports and Evidence'], ['notes','Notes'], ['assessment','Assessment']
  ];

  function renderProfile(){
    var p = state.current;
    if (!p){ state.view = 'roster'; render(); return; }
    var h = '';

    h += '<div class="row" style="margin-bottom:14px">';
    h += '<button class="btn" id="pBack">Back to Parties</button><div class="spacer"></div>';
    h += '<button class="btn" id="pEdit">Edit Profile</button>';
    h += '<button class="btn danger" id="pDelete">Delete</button>';
    h += '</div>';

    h += '<div class="pHead"><div style="flex:1;min-width:240px">';
    h += '<div class="row" style="gap:10px;margin-bottom:6px">';
    h += '<span class="tag ' + roleTagClass(p.primaryRole) + '">' + esc(roleLabel(p.primaryRole)) + '</span>';
    if (isMinor(p)) h += '<span class="tag minor">Minor</span>';
    h += '<span class="meta">' + esc(p.id) + '</span></div>';
    h += '<h2>' + esc(fullName(p)) + '</h2>';
    if (p.aliases) h += '<div class="meta">AKA ' + esc(p.aliases) + '</div>';
    h += '</div><div class="kv" style="min-width:220px">';
    h += '<div class="k">Status</div><div>' + esc(p.interviewStatus) + '</div>';
    h += '<div class="k">Priority</div><div class="pri-' + esc(p.priority) + '">' + esc(p.priority) + '</div>';
    h += '<div class="k">Source</div><div>' + esc(p.source) + (p.confidence ? ' (' + p.confidence + '%)' : '') + '</div>';
    h += '</div></div>';

    h += '<div class="tabs">' + TABS.map(function(t){
      return '<button data-t="' + t[0] + '" class="' + (state.tab === t[0] ? 'on' : '') + '">' + esc(t[1]) + '</button>';
    }).join('') + '</div>';

    h += '<div id="tabBody">' + renderTab(p) + '</div>';
    $('viewProfile').innerHTML = h;

    Array.prototype.forEach.call(document.querySelectorAll('#viewProfile .tabs button'), function(b){
      b.addEventListener('click', function(){ state.tab = this.getAttribute('data-t'); renderProfile(); });
    });
    $('pBack').addEventListener('click', function(){ state.view = 'roster'; render(); });
    $('pEdit').addEventListener('click', function(){ openForm(p.id); });
    $('pDelete').addEventListener('click', function(){
      if (!confirm('Delete ' + fullName(p) + ' from this matter?')) return;
      delRec('parties', p.id).then(function(){ toast('Deleted.'); state.view = 'roster'; return reload(); });
    });
    bindTabActions(p);
  }

  function renderTab(p){
    if (state.tab === 'overview'){
      var a = ageFrom(p.dob);
      return '<div class="twoCol">' +
        '<div class="card"><h3>Identity</h3><div class="kv">' +
          row('Legal Name', fullName(p)) +
          row('Aliases', p.aliases) +
          row('DOB', isMinor(p) ? 'Restricted, minor' : (p.dob || 'Not listed')) +
          row('Age', a === null ? 'Not listed' : String(a)) +
          row('Gender', p.gender) +
          row('Language', p.language + (p.interpreterNeeded ? ' (interpreter required)' : '')) +
          row('Employer', p.employer) +
          (roleGroup(p.primaryRole) === 'LE' ?
            row('Badge', p.badgeNumber) + row('Department', p.department) + row('Unit', p.unit) + row('Rank', p.leRank) : '') +
        '</div></div>' +
        '<div><div class="card" style="margin-bottom:12px"><h3>Case Involvement</h3>' +
          '<div style="font-size:13px;line-height:1.6">' + (esc(p.involvement) || '<span class="hint">No involvement description recorded.</span>') + '</div></div>' +
        '<div class="card"><h3>Representation</h3><div class="kv">' +
          row('Represented By', p.attorneyContact) +
          row('Interview Status', p.interviewStatus) +
          row('Attempts Logged', String((p.contactAttempts || []).length)) +
        '</div></div></div></div>';
    }
    if (state.tab === 'contact'){
      var addr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
      return '<div class="card"><h3>Contact Information</h3><div class="kv">' +
        row('Primary Phone', p.phone) + row('Alternate', p.altPhone) + row('Email', p.email) +
        row('Address', isMinor(p) ? 'Restricted, minor' : addr) +
        row('Preferred Method', p.preferredContact) +
        (isMinor(p) ? row('Guardian', p.guardianName) + row('Guardian Phone', p.guardianPhone) : '') +
        '</div></div>';
    }
    if (state.tab === 'attempts') return renderAttempts(p);
    if (state.tab === 'statements') return renderSimpleList(p, 'statements', 'Statement');
    if (state.tab === 'notes') return renderSimpleList(p, 'notes', 'Note');
    if (state.tab === 'interviews'){
      return '<div class="card"><h3>Interview</h3><div class="kv">' +
        row('Status', p.interviewStatus) +
        row('Interpreter', p.interpreterNeeded ? 'Required' : 'Not required') +
        row('Represented By', p.attorneyContact) +
        '</div><div class="hint" style="margin-top:12px">Interview scheduling links to the letter library once this module is mounted in Case Intake.</div></div>';
    }
    if (state.tab === 'relationships'){
      var rel = p.relationships || [];
      var h2 = '<div class="card"><h3>Relationships</h3>';
      if (!rel.length) h2 += '<div class="empty">No relationships recorded.</div>';
      else h2 += rel.map(function(r){
        return '<div class="listItem"><div class="top"><strong>' + esc(r.name) + '</strong><span class="tag">' + esc(r.type) + '</span></div>' +
               '<div class="hint">' + esc(r.note || '') + '</div></div>';
      }).join('');
      h2 += '<div class="row" style="margin-top:12px">' +
        '<input type="text" id="relName" placeholder="Person" style="width:170px">' +
        '<input type="text" id="relType" placeholder="Relationship" style="width:150px">' +
        '<input type="text" id="relNote" placeholder="Note" style="flex:1;min-width:150px">' +
        '<button class="btn sm" id="relAdd">Add</button></div></div>';
      return h2;
    }
    if (state.tab === 'links'){
      var docs = p.linkedDocs || [], ev = p.linkedEvidence || [];
      return '<div class="twoCol">' +
        '<div class="card"><h3>Linked Reports</h3>' +
          (docs.length ? docs.map(function(d){ return '<div class="listItem mono" style="font-size:12px">' + esc(d) + '</div>'; }).join('')
                       : '<div class="empty">No linked discovery documents.</div>') + '</div>' +
        '<div class="card"><h3>Linked Evidence</h3>' +
          (ev.length ? ev.map(function(d){ return '<div class="listItem mono" style="font-size:12px">' + esc(d) + '</div>'; }).join('')
                     : '<div class="empty">No linked evidence items.</div>') + '</div></div>';
    }
    if (state.tab === 'assessment'){
      return '<div class="card"><h3>Investigation Assessment</h3>' +
        '<div class="warn" style="margin-bottom:14px">Attorney work product. Not included in exports, letters, or AI payloads.</div>' +
        '<div class="kv">' +
        row('Credibility', p.credibility) + row('Safety Risks', p.safetyRisks) +
        row('Vulnerabilities', p.vulnerabilities) + row('Strategy Notes', p.strategyNotes) +
        '</div></div>';
    }
    return '';
  }

  function row(k, v){
    return '<div class="k">' + esc(k) + '</div><div>' + (v ? esc(v) : '<span class="hint">Not listed</span>') + '</div>';
  }

  function renderAttempts(p){
    var list = p.contactAttempts || [];
    var h = '<div class="card"><h3>Contact Attempts</h3>';
    if (!list.length) h += '<div class="empty">No contact attempts logged.</div>';
    else {
      h += list.slice().reverse().map(function(a, i){
        return '<div class="listItem"><div class="top">' +
          '<span class="mono" style="font-size:12px">' + esc(fmtDate(a.date)) + ' &middot; ' + esc(a.method) + '</span>' +
          '<span class="tag">' + esc(a.outcome) + '</span></div>' +
          '<div style="font-size:13px">' + esc(a.note || '') + '</div>' +
          '<div class="meta" style="margin-top:6px">BY ' + esc(a.by || 'UNSPECIFIED') +
          (a.minutes ? ' &middot; ' + esc(a.minutes) + ' MIN' : '') + '</div></div>';
      }).join('');
    }
    h += '<div class="fg" style="margin-top:14px">' +
      '<div class="f"><label>Date</label><input type="date" id="atDate" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
      '<div class="f"><label>Method</label><select id="atMethod">' + CONTACT_METHODS.map(function(m){ return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Outcome</label><select id="atOutcome">' + CONTACT_OUTCOMES.map(function(m){ return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Investigator</label><input type="text" id="atBy" placeholder="Initials"></div>' +
      '<div class="f"><label>Minutes</label><input type="text" id="atMin" placeholder="For CPCS billing"></div>' +
      '<div class="f full"><label>Note</label><input type="text" id="atNote"></div>' +
      '</div><button class="btn primary" id="atAdd" style="margin-top:10px">Log Attempt</button></div>';
    return h;
  }

  function renderSimpleList(p, key, label){
    var list = p[key] || [];
    var h = '<div class="card"><h3>' + esc(label) + 's</h3>';
    if (!list.length) h += '<div class="empty">No ' + esc(label.toLowerCase()) + 's recorded.</div>';
    else h += list.slice().reverse().map(function(n){
      return '<div class="listItem"><div class="meta" style="margin-bottom:5px">' + esc(fmtDate(n.date)) +
             (n.by ? ' &middot; ' + esc(n.by) : '') + '</div><div style="font-size:13px;white-space:pre-wrap">' + esc(n.text) + '</div></div>';
    }).join('');
    h += '<div class="f" style="margin-top:12px"><label>New ' + esc(label) + '</label>' +
         '<textarea id="slText"></textarea></div>' +
         '<div class="row" style="margin-top:8px"><input type="text" id="slBy" placeholder="Initials" style="width:120px">' +
         '<button class="btn primary" id="slAdd">Add ' + esc(label) + '</button></div></div>';
    return h;
  }

  function bindTabActions(p){
    if ($('atAdd')){
      $('atAdd').addEventListener('click', function(){
        p.contactAttempts = p.contactAttempts || [];
        p.contactAttempts.push({
          date: $('atDate').value || nowISO().slice(0,10),
          method: $('atMethod').value,
          outcome: $('atOutcome').value,
          by: $('atBy').value,
          minutes: $('atMin').value,
          note: $('atNote').value,
          loggedAt: nowISO()
        });
        p.updatedAt = nowISO();
        putRec('parties', p).then(function(){ toast('Attempt logged.'); return reload(); })
          .then(function(){ state.current = findParty(p.id); state.view = 'profile'; render(); });
      });
    }
    if ($('slAdd')){
      $('slAdd').addEventListener('click', function(){
        var key = state.tab === 'statements' ? 'statements' : 'notes';
        var txt = $('slText').value.trim();
        if (!txt){ toast('Nothing to save.'); return; }
        p[key] = p[key] || [];
        p[key].push({ date: nowISO(), by: $('slBy').value, text: txt });
        p.updatedAt = nowISO();
        putRec('parties', p).then(function(){ toast('Saved.'); return reload(); })
          .then(function(){ state.current = findParty(p.id); render(); });
      });
    }
    if ($('relAdd')){
      $('relAdd').addEventListener('click', function(){
        var n = $('relName').value.trim();
        if (!n){ toast('Enter a name.'); return; }
        p.relationships = p.relationships || [];
        p.relationships.push({ name:n, type:$('relType').value, note:$('relNote').value });
        p.updatedAt = nowISO();
        putRec('parties', p).then(function(){ toast('Relationship added.'); return reload(); })
          .then(function(){ state.current = findParty(p.id); render(); });
      });
    }
  }

  /* ---------- render: extraction queue ---------- */
  function renderQueue(){
    var items = state.extractions.filter(function(x){
      if (state.queueFilter === 'ALL') return x.status === 'PENDING';
      if (state.queueFilter === 'DUPES') return x.status === 'PENDING' && x.possibleMatchId;
      if (state.queueFilter === 'HIGH') return x.status === 'PENDING' && x.confidence >= 85;
      return x.status === state.queueFilter;
    });

    var h = '';
    h += '<div class="warn" style="margin-bottom:14px">Nothing here enters the roster without explicit approval. ' +
         'Extraction is a suggestion, not a finding.</div>';
    h += '<div class="row" style="margin-bottom:14px">';
    ['ALL','HIGH','DUPES','APPROVED','REJECTED'].forEach(function(f){
      h += '<button class="chip qf' + (state.queueFilter === f ? ' on' : '') + '" data-f="' + f + '">' + f + '</button>';
    });
    h += '</div>';

    if (!items.length){
      h += '<div class="empty">Queue is clear. Extracted parties appear here for approval before they join the roster.</div>';
    }
    else {
      items.forEach(function(x){
        var match = x.possibleMatchId ? findParty(x.possibleMatchId) : null;
        h += '<div class="qCard"><div class="qBody"><div class="qMain">';
        h += '<div class="meta" style="margin-bottom:6px">ID: ' + esc(x.id) + '</div>';
        h += '<div class="row" style="gap:10px;margin-bottom:10px"><span class="nm">' + esc(x.name) + '</span>' +
             '<span class="tag ' + roleTagClass(x.role) + '">' + esc(roleLabel(x.role)) + '</span></div>';
        h += '<div class="kv" style="font-size:12px">';
        h += '<div class="k">Source</div><div class="mono" style="font-size:12px">' + esc(x.source) + '</div>';
        h += '<div class="k">Confidence</div><div><span class="bar"><i style="width:' + Math.max(0,Math.min(100,x.confidence)) + '%"></i></span> ' +
             '<span class="mono">' + esc(x.confidence) + '%</span></div>';
        h += '<div class="k">Duplicate</div><div>' + (match
              ? '<span class="alertDup">Possible match</span> ' + esc(fullName(match)) +
                ' <span class="meta">' + nameSimilarity(x.name, fullName(match)) + '% similarity</span>'
              : '<span class="hint">None detected</span>') + '</div>';
        h += '</div></div>';
        h += '<div class="qActions">';
        h += '<button class="btn primary qApprove" data-id="' + esc(x.id) + '">Approve as New</button>';
        h += '<button class="btn qMerge" data-id="' + esc(x.id) + '"' + (match ? '' : ' disabled') + '>Merge</button>';
        h += '<button class="btn danger qReject" data-id="' + esc(x.id) + '">Reject</button>';
        h += '</div></div></div>';
      });
    }

    $('viewQueue').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#viewQueue .qf'), function(b){
      b.addEventListener('click', function(){ state.queueFilter = this.getAttribute('data-f'); renderQueue(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#viewQueue .qApprove'), function(b){
      b.addEventListener('click', function(){ approveExtraction(this.getAttribute('data-id')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#viewQueue .qReject'), function(b){
      b.addEventListener('click', function(){ rejectExtraction(this.getAttribute('data-id')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#viewQueue .qMerge'), function(b){
      b.addEventListener('click', function(){ openMerge(this.getAttribute('data-id')); });
    });
  }

  function findExtraction(id){
    for (var i=0;i<state.extractions.length;i++){ if (state.extractions[i].id === id) return state.extractions[i]; }
    return null;
  }

  function approveExtraction(id){
    var x = findExtraction(id);
    if (!x) return;
    var p = blankParty();
    var parts = String(x.name).trim().split(/\s+/);
    p.firstName = parts[0] || '';
    p.lastName = parts.length > 1 ? parts[parts.length-1] : '';
    p.middleName = parts.length > 2 ? parts.slice(1,-1).join(' ') : '';
    p.primaryRole = x.role;
    p.source = 'DISCOVERY EXTRACTION';
    p.confidence = x.confidence;
    p.linkedDocs = [x.source];
    p.involvement = 'Identified in ' + x.source + '. Not yet verified by investigator.';
    x.status = 'APPROVED';
    x.resolvedAt = nowISO();
    Promise.all([ putRec('parties', p), putRec('extractions', x) ]).then(function(){
      toast('Added ' + fullName(p) + ' to roster.');
      return reload();
    });
  }

  function rejectExtraction(id){
    var x = findExtraction(id);
    if (!x) return;
    x.status = 'REJECTED';
    x.resolvedAt = nowISO();
    putRec('extractions', x).then(function(){ toast('Rejected.'); return reload(); });
  }

  /* ---------- render: merge resolver ---------- */
  var MERGE_FIELDS = [
    ['firstName','First Name'], ['middleName','Middle Name'], ['lastName','Last Name'],
    ['aliases','Aliases'], ['dob','DOB'], ['phone','Phone'], ['email','Email'],
    ['address','Address'], ['primaryRole','Primary Role'], ['badgeNumber','Badge'],
    ['department','Department'], ['involvement','Involvement']
  ];

  function openMerge(extId){
    var x = findExtraction(extId);
    if (!x || !x.possibleMatchId) return;
    var existing = findParty(x.possibleMatchId);
    if (!existing) { toast('Match record not found.'); return; }
    var incoming = blankParty();
    var parts = String(x.name).trim().split(/\s+/);
    incoming.firstName = parts[0] || '';
    incoming.lastName = parts.length > 1 ? parts[parts.length-1] : '';
    incoming.middleName = parts.length > 2 ? parts.slice(1,-1).join(' ') : '';
    incoming.primaryRole = x.role;
    incoming.involvement = 'Identified in ' + x.source + '.';
    state.mergePair = { extId: extId, existing: existing, incoming: incoming, source: x.source };
    state.mergeChoice = {};
    MERGE_FIELDS.forEach(function(f){
      state.mergeChoice[f[0]] = existing[f[0]] ? 'existing' : 'incoming';
    });
    state.view = 'merge';
    render();
  }

  function renderMerge(){
    var m = state.mergePair;
    if (!m){ state.view = 'queue'; render(); return; }
    var h = '';
    h += '<div class="row" style="margin-bottom:14px"><button class="btn" id="mBack">Back to Queue</button>' +
         '<div class="spacer"></div><button class="btn primary" id="mApply">Apply Merge</button></div>';
    h += '<div class="warn" style="margin-bottom:14px">Pick the surviving value for each field. ' +
         'The existing record ID is kept. Contact attempts, statements, and notes are preserved.</div>';
    h += '<div class="mergeGrid">';
    h += '<div class="hd">Field</div><div class="hd">Existing record</div><div class="hd">Incoming from discovery</div>';
    MERGE_FIELDS.forEach(function(f){
      var k = f[0];
      var ev = m.existing[k] || '';
      var iv = m.incoming[k] || '';
      if (k === 'primaryRole'){ ev = roleLabel(ev); iv = roleLabel(iv); }
      h += '<div class="hd">' + esc(f[1]) + '</div>';
      h += '<div class="mergeOpt' + (state.mergeChoice[k] === 'existing' ? ' on' : '') + '" data-k="' + k + '" data-c="existing">' +
           (ev ? esc(ev) : '<span class="hint">Empty</span>') + '</div>';
      h += '<div class="mergeOpt' + (state.mergeChoice[k] === 'incoming' ? ' on' : '') + '" data-k="' + k + '" data-c="incoming">' +
           (iv ? esc(iv) : '<span class="hint">Empty</span>') + '</div>';
    });
    h += '</div>';
    $('viewMerge').innerHTML = h;

    Array.prototype.forEach.call(document.querySelectorAll('#viewMerge .mergeOpt'), function(el){
      el.addEventListener('click', function(){
        state.mergeChoice[this.getAttribute('data-k')] = this.getAttribute('data-c');
        renderMerge();
      });
    });
    $('mBack').addEventListener('click', function(){ state.view = 'queue'; render(); });
    $('mApply').addEventListener('click', applyMerge);
  }

  function applyMerge(){
    var m = state.mergePair;
    var target = JSON.parse(JSON.stringify(m.existing));
    MERGE_FIELDS.forEach(function(f){
      var k = f[0];
      var src = state.mergeChoice[k] === 'incoming' ? m.incoming : m.existing;
      if (src[k]) target[k] = src[k];
    });
    target.linkedDocs = (target.linkedDocs || []).concat([m.source]).filter(function(v,i,a){ return a.indexOf(v) === i; });
    target.notes = (target.notes || []).concat([{
      date: nowISO(), by: 'SYSTEM',
      text: 'Merged extraction record ' + m.extId + ' from ' + m.source + '.'
    }]);
    target.updatedAt = nowISO();
    var x = findExtraction(m.extId);
    x.status = 'APPROVED';
    x.mergedInto = target.id;
    x.resolvedAt = nowISO();
    Promise.all([ putRec('parties', target), putRec('extractions', x) ]).then(function(){
      toast('Merged into ' + fullName(target));
      state.view = 'queue';
      state.mergePair = null;
      return reload();
    });
  }

  /* ---------- export and AI payload ---------- */
  function safeCopy(p, opts){
    var o = JSON.parse(JSON.stringify(p));
    if (!opts.includeWorkProduct){
      WORK_PRODUCT_FIELDS.forEach(function(k){ delete o[k]; });
    }
    if (!opts.includePII){
      RESTRICTED_FIELDS.forEach(function(k){ delete o[k]; });
    }
    if (isMinor(p)){
      delete o.dob; delete o.address; delete o.zip;
      o.minorRedacted = true;
    }
    return o;
  }

  function buildAIPayload(){
    return state.parties.map(function(p){
      var o = safeCopy(p, { includeWorkProduct:false, includePII: ALLOW_PII_TO_AI });
      return {
        id: o.id, name: fullName(p), role: roleLabel(p.primaryRole),
        involvement: o.involvement, interviewStatus: o.interviewStatus,
        badgeNumber: o.badgeNumber || '', department: o.department || ''
      };
    });
  }

  function doExport(){
    var payload = {
      module: 'ARC_PARTIES',
      version: '1.0.0',
      caseId: state.caseId,
      exportedAt: nowISO(),
      workProductIncluded: ALLOW_WORKPRODUCT_EXPORT,
      parties: state.parties.map(function(p){
        return safeCopy(p, { includeWorkProduct: ALLOW_WORKPRODUCT_EXPORT, includePII: true });
      })
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'arc_parties_' + state.caseId.replace(/[^A-Za-z0-9_-]/g,'_') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
    toast('Exported ' + state.parties.length + ' parties. Work product excluded.');
  }

  /* ---------- sample data ---------- */


  /* ---------- router ---------- */
  function render(){
    ['viewRoster','viewForm','viewProfile','viewQueue','viewMerge'].forEach(function(v){
      $(v).classList.add('hidden');
    });
    var titles = {
      roster: ['PARTIES / ROSTER','Parties Involved','Every person connected to the active matter.'],
      form: ['PARTIES / CREATE','Add or Edit Person','Create a person profile within the active matter.'],
      profile: ['PARTIES / PROFILE','Person Profile','Full record, contact history, and linked material.'],
      queue: ['DISCOVERY / QUEUE','Extracted People Review','Verify before adding. Extraction is a suggestion, not a finding.'],
      merge: ['DISCOVERY / MERGE','Resolve Duplicate','Choose the surviving value for each field.']
    };
    var t = titles[state.view] || titles.roster;
    $('crumb').textContent = t[0];
    $('pageTitle').textContent = t[1];
    $('pageSub').textContent = t[2];

    var pend = state.extractions.filter(function(x){ return x.status === 'PENDING'; }).length;
    $('queueCount').textContent = pend ? '(' + pend + ')' : '';

    if (state.view === 'roster'){ $('viewRoster').classList.remove('hidden'); renderRoster(); }
    else if (state.view === 'form'){ $('viewForm').classList.remove('hidden'); renderForm(); }
    else if (state.view === 'profile'){ $('viewProfile').classList.remove('hidden'); renderProfile(); }
    else if (state.view === 'queue'){ $('viewQueue').classList.remove('hidden'); renderQueue(); }
    else if (state.view === 'merge'){ $('viewMerge').classList.remove('hidden'); renderMerge(); }
  }

  /* ---------- public surface for host page ---------- */
  window.ARCParties = {
    setCase: function(caseId){
      // Canonical ARC case id only. A display name or docket is never an
      // identifier, and there is no demo fallback: with no valid id the module
      // shows an empty roster rather than another case's parties.
      var value = String(caseId || '').trim();
      state.caseId = /^[A-Za-z0-9_-]{4,64}$/.test(value) ? value : '';
      var box = $('caseIdInput');
      if (box) box.textContent = state.caseId || 'no active case';
      state.view = 'roster';
      return reload();
    },
    getParties: function(){ return JSON.parse(JSON.stringify(state.parties)); },
    getAIPayload: buildAIPayload,
    addExtraction: function(rec){
      rec.id = rec.id || uid('EXT');
      rec.caseId = state.caseId;
      rec.status = rec.status || 'PENDING';
      return putRec('extractions', rec).then(reload);
    },
    exportJSON: doExport
  };

  /* ---------- boot ---------- */
  /* The active case is owned by arc_unified_bridge.js. The module follows it
     and never lets the user retype it: a mistyped id was previously enough to
     file a party against the wrong matter. */
  function activeCaseId(){
    var ctx = (window.ARCUnified && typeof window.ARCUnified.getCase === 'function')
      ? window.ARCUnified.getCase()
      : (window.ARC_CASE_CONTEXT || {});
    var value = String((ctx && ctx.caseId) || '').trim();
    return /^[A-Za-z0-9_-]{4,64}$/.test(value) ? value : '';
  }

  function boot(){
    state.caseId = activeCaseId();
    var box = $('caseIdInput');
    if (box) box.textContent = state.caseId || 'no active case';
    document.addEventListener('arc:case-updated', function(){
      var next = activeCaseId();
      if (next === state.caseId) return;
      state.caseId = next;
      if (box) box.textContent = state.caseId || 'no active case';
      state.view = 'roster';
      reload();
    });
    $('navRoster').addEventListener('click', function(){ state.view = 'roster'; render(); });
    $('navQueue').addEventListener('click', function(){ state.view = 'queue'; render(); });
    $('navExport').addEventListener('click', doExport);

    openDB().then(function(d){
      db = d;
      $('syncStamp').textContent = 'LOCAL STORE READY';
      return reload();
    }).catch(function(err){
      $('syncStamp').textContent = 'STORAGE ERROR';
      toast('IndexedDB unavailable. ' + (err && err.message ? err.message : ''));
    });
  }

  // Mounted on demand by the workspace rather than on DOMContentLoaded: the
  // stage markup does not exist until renderParties() runs.
  window.ARCPartiesMount = function(){
    if (!document.getElementById('arcPartiesRoot')) return false;
    boot();
    return true;
  };

})();
