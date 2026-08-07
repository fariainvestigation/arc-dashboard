/* ARC MOTION frontend. Vanilla JS single-page app, hash routing, fetch API.
   No external network calls. All state lives on the local server. */
'use strict';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}, ...opts,
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Request failed', 'bad'); throw new Error(j.error || 'Request failed'); }
  return j;
};
function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = 'notice n-' + (kind === 'bad' ? 'bad' : kind === 'ok' ? 'ok' : kind);
  t.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:60;max-width:380px;box-shadow:0 4px 14px rgba(0,0,0,.2)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

const S = { caseId: localStorage.getItem('arc_case') || '', cases: [], profiles: [], state: {} };

/* ---------- modal ---------- */
function modal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* Generic form renderer: fields = [{k,label,type,options,full}] */
function formHtml(fields, values = {}) {
  return fields.map(f => {
    const v = values[f.k] ?? '';
    const span = `<span>${esc(f.label)}</span>`;
    if (f.type === 'textarea') return `<label class="f" style="grid-column:1/-1">${span}<textarea data-k="${f.k}">${esc(v)}</textarea></label>`;
    if (f.type === 'select') return `<label class="f">${span}<select data-k="${f.k}">${f.options.map(o => `<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
    if (f.type === 'check') return `<label class="f">${span}<select data-k="${f.k}"><option value="0" ${!+v?'selected':''}>No</option><option value="1" ${+v?'selected':''}>Yes</option></select></label>`;
    return `<label class="f"${f.full?' style="grid-column:1/-1"':''}>${span}<input data-k="${f.k}" type="${f.type||'text'}" value="${esc(v)}"></label>`;
  }).join('');
}
function readForm(root) {
  const out = {};
  root.querySelectorAll('[data-k]').forEach(el => out[el.dataset.k] = el.value);
  return out;
}

/* ---------- navigation ---------- */
const NAV = [
  ['Case work', [['dashboard','Dashboard'],['cases','Cases'],['evidence','Evidence'],['facts','Facts & Conflicts'],['people','People'],['timeline','Timeline']]],
  ['Motions', [['analysis','Motion Analysis'],['irac','IRAC Builder'],['builder','Motion Builder'],['fullmotions','Full Motions'],['exhibits','Exhibits'],['pictures','Picture Center'],['packets','Filing Packets']]],
  ['Library', [['research','Legal Research'],['knowledge','Knowledge Library']]],
  ['System', [['profile','Attorney Profile'],['settings','Settings'],['audit','Audit History']]],
];
function renderNav() {
  const route = location.hash.replace('#','') || 'dashboard';
  $('#nav').innerHTML = NAV.map(([g, items]) =>
    `<div class="nav-group">${g}</div>` + items.map(([r, label]) =>
      `<a href="#${r}" class="${r===route.split('/')[0]?'active':''}">${label}</a>`).join('')).join('');
}

/* ---------- boot ---------- */
async function boot() {
  S.state = await api('/api/state');
  S.profiles = S.state.profiles;
  S.cases = await api('/api/cases');
  if (!S.caseId && S.cases.length) S.caseId = S.cases[0].id;
  if (S.caseId && !S.cases.find(c => c.id === S.caseId)) S.caseId = S.cases[0]?.id || '';
  const pick = $('#casePick');
  pick.innerHTML = '<option value="">- no case selected -</option>' +
    S.cases.filter(c => !c.archived).map(c => `<option value="${c.id}" ${c.id===S.caseId?'selected':''}>${esc(c.arc_case_id)} · ${esc(c.client_name)}</option>`).join('');
  pick.onchange = () => { S.caseId = pick.value; localStorage.setItem('arc_case', S.caseId); route(); };
  if (S.state.firstLaunch) { location.hash = 'welcome'; }
  route();
}
window.addEventListener('hashchange', route);

const activeCase = () => S.cases.find(c => c.id === S.caseId);
function needCase(view) {
  if (S.caseId) return false;
  view.innerHTML = `<h1>No active case</h1><p class="sub">Create or select a case to begin.</p>
    <div class="panel"><button class="primary" onclick="location.hash='cases'">Go to Cases</button></div>`;
  return true;
}

async function route() {
  renderNav();
  const view = $('#view');
  const [page, arg] = (location.hash.replace('#','') || 'dashboard').split('/');
  const pages = { welcome, dashboard, cases, evidence, facts, people, timeline, analysis, irac, builder,
    fullmotions, exhibits, pictures, packets, research, knowledge, profile, settings, audit };
  try { await (pages[page] || dashboard)(view, arg); }
  catch (e) { view.innerHTML = `<div class="notice n-bad">Error: ${esc(e.message)}</div>`; }
}

/* ---------- welcome / first launch ---------- */
async function welcome(view) {
  view.innerHTML = `<h1>Welcome to ARC MOTION</h1>
  <p class="sub">Massachusetts criminal defense motion and litigation workspace.</p>
  <div class="panel">
    <p><b>Before you begin, understand what this tool is.</b></p>
    <p>ARC MOTION is a drafting and case-management tool. It is not a lawyer and it is not a substitute for attorney
    judgment. Every fact, citation, exhibit, and filing decision requires review and approval by qualified counsel.
    Nothing this tool produces is approved for filing until an attorney explicitly marks it approved.</p>
    <p>If AI features are enabled later, selected case material is sent to the configured provider. AI output is always
    treated as an unverified proposal. AI is optional; every core function works without it.</p>
  </div>
  <div class="panel"><h2>Step 1 - Create your attorney profile</h2><div class="grid2" id="wProf">${formHtml([
    {k:'name',label:'Attorney name'},{k:'bbo',label:'BBO number'},{k:'firm',label:'Firm'},{k:'phone',label:'Phone'},
    {k:'address',label:'Address'},{k:'email',label:'Email'},{k:'city',label:'City'},{k:'zip',label:'ZIP'},
  ])}</div>
  <button class="primary" id="wSave">Save profile and finish setup</button>
  <button id="wSkip">Skip for now</button></div>`;
  $('#wSave').onclick = async () => {
    const b = readForm($('#wProf')); b.is_default = 1;
    if (!b.name) return toast('Attorney name is required', 'bad');
    await api('/api/profiles', { method: 'POST', body: b });
    await api('/api/settings', { method: 'POST', body: { setup_complete: '1' } });
    toast('Profile saved', 'ok'); location.hash = 'cases'; boot();
  };
  $('#wSkip').onclick = async () => { await api('/api/settings', { method: 'POST', body: { setup_complete: '1' } }); location.hash = 'cases'; boot(); };
}

/* ---------- dashboard ---------- */
async function dashboard(view) {
  if (needCase(view)) return;
  const c = await api('/api/cases/' + S.caseId);
  const d = await api(`/api/cases/${S.caseId}/dashboard`);
  const ms = Object.fromEntries(d.motions_by_status.map(r => [r.status, r.n]));
  const lane = s => ms[s] || 0;
  view.innerHTML = `<h1>${esc(c.client_name)}</h1>
  <p class="sub">${esc(c.arc_case_id)} · Docket ${esc(c.docket_number||'-')} · ${esc([c.court_department,c.court_division].filter(Boolean).join(', ')||'Court not set')}
  ${c.next_court_date?` · Next date <b>${esc(c.next_court_date)}</b>`:''}</p>
  ${c.charges.length?`<div class="panel mb0" style="margin-bottom:18px"><b>Charges:</b> ${c.charges.map(x=>esc(x.charge)+(x.statute?` <span class="muted">(${esc(x.statute)})</span>`:'')).join(' · ')}</div>`:''}
  <div class="cards">
    <div class="stat"><b>${d.document_count}</b><span>Documents</span></div>
    <div class="stat"><b>${d.unverified_facts}</b><span>Unverified facts</span></div>
    <div class="stat"><b>${d.conflicts}</b><span>Open conflicts</span></div>
    <div class="stat"><b>${d.missing_discovery}</b><span>Missing discovery facts</span></div>
    <div class="stat"><b>${d.exhibit_count}</b><span>Exhibits</span></div>
    <div class="stat"><b>${d.unverified_authorities}/${d.authority_count}</b><span>Authorities unverified</span></div>
  </div>
  <div class="board">
    <div class="lane draft"><h3>Draft Now <span>${lane('Draft Now')}</span></h3><div class="muted" style="padding:0 4px">Supported by verified facts or baseline practice.</div></div>
    <div class="lane needs"><h3>Needs More Facts <span>${lane('Needs More Facts')}</span></h3><div class="muted" style="padding:0 4px">Triggered, but the record needs verification.</div></div>
    <div class="lane notyet"><h3>Not Supported Yet <span>${lane('Not Supported Yet')}</span></h3><div class="muted" style="padding:0 4px">No factual basis in the record.</div></div>
  </div>
  <div class="panel" style="margin-top:18px"><h2>Motion pipeline</h2>
    ${['Drafting','Attorney Editing','Ready for Final Review','Approved for Filing','Filed'].map(s=>`<span class="badge b-info" style="margin-right:6px">${s}: ${lane(s)}</span>`).join('')}
    <div class="row" style="margin-top:12px">
      <button class="primary" onclick="location.hash='analysis'">Open Motion Analysis</button>
      <button onclick="location.hash='facts'">Review Facts</button>
      <button onclick="location.hash='packets'">Filing Packets</button>
    </div>
  </div>
  <div class="panel"><h2>Recent activity</h2>
    ${d.recent.length?`<table><tr><th>When</th><th>Action</th><th>Summary</th></tr>${d.recent.map(r=>`<tr><td class="mono">${esc(r.at.slice(0,16).replace('T',' '))}</td><td>${esc(r.action)}</td><td>${esc(r.summary)}</td></tr>`).join('')}</table>`:'<p class="muted">No activity recorded yet.</p>'}
  </div>`;
}

/* ---------- cases ---------- */
const CASE_FIELDS = [
  {k:'client_name',label:'Client full name'},{k:'docket_number',label:'Docket number'},
  {k:'court_department',label:'Court department'},{k:'court_division',label:'Court division'},
  {k:'county',label:'County'},{k:'client_pronouns',label:'Client pronouns',type:'select',options:['','his','her','their']},
  {k:'custody_status',label:'Custody status'},{k:'bail_status',label:'Bail status'},
  {k:'next_court_date',label:'Next court date',type:'date'},{k:'procedural_posture',label:'Procedural posture'},
  {k:'arrest_date',label:'Arrest date',type:'date'},{k:'incident_date',label:'Incident date',type:'date'},
  {k:'discovery_due',label:'Discovery due',type:'date'},{k:'motion_deadline',label:'Motion deadline',type:'date'},
  {k:'trial_date',label:'Trial date',type:'date'},{k:'judge',label:'Assigned judge'},
  {k:'prosecutor',label:'Assigned prosecutor'},{k:'police_department',label:'Police department'},
  {k:'tags',label:'Tags'},{k:'notes',label:'Notes',type:'textarea'},
];
async function cases(view) {
  const rows = await api('/api/cases');
  view.innerHTML = `<h1>Cases</h1><p class="sub">Each case is isolated: documents, facts, motions, and exhibits never cross between cases.</p>
  <div class="panel"><button class="gold" id="newCase">＋ New case</button></div>
  <div class="panel"><table><tr><th>ARC ID</th><th>Client</th><th>Docket</th><th>Court</th><th>Next date</th><th></th></tr>
  ${rows.map(c=>`<tr><td class="mono">${esc(c.arc_case_id)}</td><td><b>${esc(c.client_name)}</b>${c.archived?' <span class="badge b-mut">archived</span>':''}</td>
    <td>${esc(c.docket_number)}</td><td>${esc([c.court_department,c.court_division].filter(Boolean).join(', '))}</td><td>${esc(c.next_court_date)}</td>
    <td><button class="link" data-open="${c.id}">Open</button> <button class="link" data-edit="${c.id}">Edit</button></td></tr>`).join('')}
  </table></div>`;
  $('#newCase').onclick = () => caseForm();
  view.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { S.caseId = b.dataset.open; localStorage.setItem('arc_case', S.caseId); boot(); location.hash = 'dashboard'; });
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => caseForm(rows.find(c => c.id === b.dataset.edit)));
}
async function caseForm(existing) {
  const full = existing ? await api('/api/cases/' + existing.id) : { charges: [] };
  const attys = S.profiles.map(p => `<option value="${p.id}" ${full.attorney_profile_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  modal(`<h2>${existing?'Edit case':'New case'}</h2><div class="grid2" id="cf">${formHtml(CASE_FIELDS, full)}
    <label class="f"><span>Primary filing counsel</span><select data-k="attorney_profile_id"><option value="">-</option>${attys}</select></label>
    ${existing?`<label class="f"><span>Archived</span><select data-k="archived"><option value="0" ${!full.archived?'selected':''}>No</option><option value="1" ${full.archived?'selected':''}>Yes</option></select></label>`:''}
  </div>
  <h2>Charges</h2><div id="chg">${(full.charges||[]).map(ch=>chargeRow(ch)).join('')}</div>
  <button id="addChg">＋ Add charge</button>
  <div class="row" style="margin-top:16px"><button class="primary" id="cSave">Save case</button><button onclick="document.querySelector('#modal').hidden=true">Cancel</button></div>`);
  $('#addChg').onclick = () => $('#chg').insertAdjacentHTML('beforeend', chargeRow({}));
  $('#cSave').onclick = async () => {
    const b = readForm($('#cf'));
    b.charges = [...$('#chg').querySelectorAll('.chg')].map(r => ({
      charge: r.querySelector('[data-c]').value, statute: r.querySelector('[data-s]').value })).filter(x => x.charge);
    if (!b.client_name) return toast('Client name is required', 'bad');
    if (existing) await api('/api/cases/' + existing.id, { method: 'PUT', body: b });
    else { const c = await api('/api/cases', { method: 'POST', body: b }); S.caseId = c.id; localStorage.setItem('arc_case', c.id); }
    closeModal(); toast('Case saved', 'ok'); boot();
  };
}
const chargeRow = ch => `<div class="row chg" style="margin-bottom:6px"><input data-c placeholder="Charge" value="${esc(ch.charge||'')}" style="flex:2"><input data-s placeholder="Statute (e.g. G.L. c. 90, § 24)" value="${esc(ch.statute||'')}" style="flex:1"></div>`;

/* ---------- evidence (documents) ---------- */
async function evidence(view) {
  if (needCase(view)) return;
  const docs = await api(`/api/cases/${S.caseId}/documents`);
  view.innerHTML = `<h1>Evidence & Discovery</h1><p class="sub">Originals are preserved exactly as uploaded and are never modified. SHA-256 recorded on intake.</p>
  <div class="panel"><div class="row"><input type="file" id="up" multiple style="width:auto"><input id="upSrc" placeholder="Source / producing agency" style="max-width:260px"><button class="primary" id="upBtn">Upload</button></div>
  <p class="muted mb0" style="margin-top:6px">Accepted: PDF, DOCX, TXT, HTML, JPG, PNG, WEBP, TIFF, CSV, JSON, audio/video files. 250&nbsp;MB per file.</p></div>
  <div class="panel"><table><tr><th>File</th><th>Type</th><th>Size</th><th>Batch / Bates</th><th>Description</th><th>SHA-256</th><th></th></tr>
  ${docs.map(d=>`<tr><td><b>${esc(d.original_filename)}</b><br><small class="muted">${esc(d.uploaded_at.slice(0,10))} · ${esc(d.source||'')}</small></td>
  <td>${esc(d.file_type)}</td><td>${(d.file_size/1024).toFixed(0)} KB</td><td>${esc(d.discovery_batch)}${d.bates_range?'<br>'+esc(d.bates_range):''}</td>
  <td>${esc(d.description)}</td><td class="mono">${esc(d.sha256.slice(0,12))}…</td>
  <td><a class="btn" href="/api/documents/${d.id}/file" target="_blank">View</a> <button class="link" data-meta="${d.id}">Details</button></td></tr>`).join('')||'<tr><td colspan="7" class="muted">No documents uploaded.</td></tr>'}
  </table></div>`;
  $('#upBtn').onclick = async () => {
    const files = $('#up').files;
    if (!files.length) return toast('Choose files first', 'warn');
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.append('source', $('#upSrc').value);
    await api(`/api/cases/${S.caseId}/documents`, { method: 'POST', body: fd });
    toast(files.length + ' file(s) uploaded', 'ok'); route();
  };
  view.querySelectorAll('[data-meta]').forEach(b => b.onclick = () => {
    const d = docs.find(x => x.id === b.dataset.meta);
    modal(`<h2>${esc(d.original_filename)}</h2><div class="grid2" id="df">${formHtml([
      {k:'source',label:'Source'},{k:'producing_agency',label:'Producing agency'},{k:'discovery_batch',label:'Discovery batch'},
      {k:'bates_range',label:'Bates range'},{k:'document_date',label:'Document date',type:'date'},{k:'author',label:'Author'},
      {k:'privilege',label:'Privilege',type:'select',options:['none','work product','attorney-client','ex parte']},
      {k:'confidentiality',label:'Confidentiality',type:'select',options:['none','confidential','sealed']},
      {k:'description',label:'Description',type:'textarea'},{k:'notes',label:'Attorney notes',type:'textarea'},
    ], d)}</div>
    <div class="row"><button class="primary" id="dSave">Save</button><button class="danger" id="dDel">Remove record</button></div>
    <p class="muted" style="margin-top:8px">Removing the record does not delete the original file from disk.</p>`);
    $('#dSave').onclick = async () => { await api('/api/documents/' + d.id, { method: 'PUT', body: readForm($('#df')) }); closeModal(); toast('Saved','ok'); route(); };
    $('#dDel').onclick = async () => { await api('/api/documents/' + d.id, { method: 'DELETE' }); closeModal(); route(); };
  });
}

/* ---------- facts & conflicts ---------- */
const FACT_CATS = ['identity','timeline','location','police observation','stop','frisk','search','seizure','arrest','statement','miranda','voluntariness','identification','warrant','probable cause','digital evidence','social media','phone evidence','location data','authentication','chain of custody','witness credibility','brady','impeachment','missing discovery','interpreter','prior bad acts','immigration reference','gang reference','firearm reference','mitigation','alibi','medical','mental health','expert issue','other'];
async function facts(view) {
  if (needCase(view)) return;
  const [rows, docs, conflicts] = await Promise.all([
    api(`/api/cases/${S.caseId}/facts`), api(`/api/cases/${S.caseId}/documents`), api(`/api/cases/${S.caseId}/conflicts`)]);
  const docName = id => docs.find(d => d.id === id)?.original_filename || '';
  const vbadge = v => v==='verified'?'<span class="badge b-ok">verified</span>':v==='rejected'?'<span class="badge b-bad">rejected</span>':'<span class="badge b-warn">unverified</span>';
  view.innerHTML = `<h1>Facts</h1><p class="sub">Every fact carries its source. Unverified facts are flagged everywhere they appear and block clean filing checks.</p>
  <div class="panel"><button class="gold" id="newFact">＋ Add fact</button>
  <button id="newConflict">Record a conflict</button>
  <a class="btn" href="/api/cases/${S.caseId}/export/facts.csv">Export CSV</a></div>
  <div class="panel"><table><tr><th>Fact</th><th>Category</th><th>Source</th><th>Asserted by</th><th>Status</th><th></th></tr>
  ${rows.map(f=>`<tr><td style="max-width:420px">${esc(f.statement)}${f.conflict_status!=='none'?` <span class="badge b-bad">conflict: ${esc(f.conflict_status)}</span>`:''}${f.ai_generated?' <span class="badge b-mut">AI proposal</span>':''}</td>
  <td>${esc(f.category)}</td><td>${esc(docName(f.source_document_id))}${f.page?` p.${esc(f.page)}`:''}</td><td>${esc(f.asserted_by)}</td>
  <td>${vbadge(f.verification)}</td><td><button class="link" data-ed="${f.id}">Edit</button>${f.verification!=='verified'?` <button class="link" data-v="${f.id}">Verify</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">No facts recorded.</td></tr>'}
  </table></div>
  <h2 style="margin-top:24px">Conflict Center</h2>
  <p class="sub">ARC never decides which account is true. Both versions stay visible until counsel classifies the conflict.</p>
  <div class="panel">${conflicts.length?conflicts.map(cf=>`<div class="notice ${cf.status==='unresolved'||cf.status==='material'?'n-bad':'n-info'}">
    <b>${esc(cf.conflict_type)}</b> - status: <b>${esc(cf.status)}</b><br>
    A: ${esc(cf.a?.statement||'?')} <span class="muted">(${esc(cf.a?.asserted_by||'')})</span><br>
    B: ${esc(cf.b?.statement||'?')} <span class="muted">(${esc(cf.b?.asserted_by||'')})</span><br>
    ${cf.attorney_note?`Note: ${esc(cf.attorney_note)}<br>`:''}
    <select data-cf="${cf.id}" style="width:auto;margin-top:4px">${['unresolved','material','immaterial','resolved_source','attorney_determination'].map(s=>`<option ${s===cf.status?'selected':''}>${s}</option>`).join('')}</select>
  </div>`).join(''):'<p class="muted mb0">No conflicts recorded.</p>'}</div>`;
  const factForm = (f = {}) => {
    modal(`<h2>${f.id?'Edit fact':'New fact'}</h2><div class="grid2" id="ff">${formHtml([
      {k:'statement',label:'Fact statement',type:'textarea'},
      {k:'category',label:'Category',type:'select',options:FACT_CATS},
      {k:'asserted_by',label:'Person asserting'},
      {k:'event_date',label:'Date of event',type:'date'},{k:'location',label:'Location'},
      {k:'page',label:'Page'},{k:'paragraph',label:'Paragraph'},{k:'timestamp_ref',label:'Timestamp (audio/video)'},
      {k:'verification',label:'Verification',type:'select',options:['unverified','verified','rejected']},
      {k:'defense_significance',label:'Defense significance',type:'textarea'},
      {k:'notes',label:'Attorney notes',type:'textarea'},
    ], f)}
    <label class="f"><span>Source document</span><select data-k="source_document_id"><option value="">-</option>${docs.map(d=>`<option value="${d.id}" ${f.source_document_id===d.id?'selected':''}>${esc(d.original_filename)}</option>`).join('')}</select></label>
    </div><div class="row"><button class="primary" id="fSave">Save fact</button>${f.id?'<button class="danger" id="fDel">Delete</button>':''}</div>`);
    $('#fSave').onclick = async () => {
      const b = readForm($('#ff'));
      if (!b.statement) return toast('A fact needs a statement', 'bad');
      if (f.id) await api('/api/facts/' + f.id, { method: 'PUT', body: b });
      else await api(`/api/cases/${S.caseId}/facts`, { method: 'POST', body: b });
      closeModal(); toast('Fact saved', 'ok'); route();
    };
    if (f.id) $('#fDel').onclick = async () => { await api('/api/facts/' + f.id, { method: 'DELETE' }); closeModal(); route(); };
  };
  $('#newFact').onclick = () => factForm();
  view.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => factForm(rows.find(f => f.id === b.dataset.ed)));
  view.querySelectorAll('[data-v]').forEach(b => b.onclick = async () => { await api('/api/facts/' + b.dataset.v, { method: 'PUT', body: { verification: 'verified' } }); toast('Fact verified', 'ok'); route(); });
  $('#newConflict').onclick = () => {
    if (rows.length < 2) return toast('Need at least two facts to record a conflict', 'warn');
    const opts = rows.map(f => `<option value="${f.id}">${esc(f.statement.slice(0,90))}</option>`).join('');
    modal(`<h2>Record a conflict</h2>
    <label class="f"><span>Account A</span><select id="cfa">${opts}</select></label>
    <label class="f"><span>Account B</span><select id="cfb">${opts}</select></label>
    <label class="f"><span>Conflict type</span><select id="cft">${['dates','times','locations','descriptions','witness accounts','officer accounts','identification details','statement descriptions','property inventories','search justifications','probable cause assertions','digital attribution claims'].map(t=>`<option>${t}</option>`).join('')}</select></label>
    <label class="f"><span>Attorney note</span><textarea id="cfn"></textarea></label>
    <button class="primary" id="cfSave">Save conflict</button>`);
    $('#cfSave').onclick = async () => {
      if ($('#cfa').value === $('#cfb').value) return toast('Choose two different facts', 'bad');
      await api(`/api/cases/${S.caseId}/conflicts`, { method: 'POST', body: { fact_a: $('#cfa').value, fact_b: $('#cfb').value, conflict_type: $('#cft').value, attorney_note: $('#cfn').value } });
      closeModal(); toast('Conflict recorded', 'ok'); route();
    };
  };
  view.querySelectorAll('[data-cf]').forEach(sel => sel.onchange = async () => {
    await api('/api/conflicts/' + sel.dataset.cf, { method: 'PUT', body: { status: sel.value } }); toast('Conflict updated', 'ok'); route();
  });
}

/* ---------- people ---------- */
async function people(view) {
  if (needCase(view)) return;
  const rows = await api(`/api/cases/${S.caseId}/people`);
  const ROLES = ['defendant','officer','detective','civilian witness','alleged victim','expert','interpreter','prosecutor','defense attorney','custodian of records','other'];
  view.innerHTML = `<h1>People</h1><p class="sub">Officers, witnesses, experts, and everyone else connected to the case.</p>
  <div class="panel"><button class="gold" id="newP">＋ Add person</button></div>
  <div class="panel"><table><tr><th>Name</th><th>Role</th><th>Agency / Badge</th><th>Credibility issues</th><th></th></tr>
  ${rows.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.role)}</td><td>${esc(p.agency)}${p.badge?' #'+esc(p.badge):''}</td>
  <td>${p.credibility_issues?'<span class="badge b-warn">yes</span> '+esc(p.credibility_issues.slice(0,80)):''}</td>
  <td><button class="link" data-ed="${p.id}">Edit</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">No people recorded.</td></tr>'}</table></div>`;
  const pform = (p = {}) => {
    modal(`<h2>${p.id?'Edit person':'New person'}</h2><div class="grid2" id="pf">${formHtml([
      {k:'name',label:'Name'},{k:'role',label:'Role',type:'select',options:ROLES},{k:'agency',label:'Agency'},{k:'badge',label:'Badge number'},
      {k:'contact',label:'Contact information'},{k:'identification_involvement',label:'Identification involvement'},
      {k:'credibility_issues',label:'Credibility issues',type:'textarea'},{k:'prior_inconsistent',label:'Prior inconsistent statements',type:'textarea'},
      {k:'disclosure_issues',label:'Disclosure issues',type:'textarea'},{k:'notes',label:'Notes',type:'textarea'},
    ], p)}</div><div class="row"><button class="primary" id="pSave">Save</button>${p.id?'<button class="danger" id="pDel">Delete</button>':''}</div>`);
    $('#pSave').onclick = async () => {
      const b = readForm($('#pf'));
      if (p.id) await api('/api/people/' + p.id, { method: 'PUT', body: b });
      else await api(`/api/cases/${S.caseId}/people`, { method: 'POST', body: b });
      closeModal(); route();
    };
    if (p.id) $('#pDel').onclick = async () => { await api('/api/people/' + p.id, { method: 'DELETE' }); closeModal(); route(); };
  };
  $('#newP').onclick = () => pform();
  view.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => pform(rows.find(p => p.id === b.dataset.ed)));
}

/* ---------- timeline ---------- */
async function timeline(view) {
  if (needCase(view)) return;
  const rows = await api(`/api/cases/${S.caseId}/timeline`);
  const TYPES = ['incident','police action','witness statement','arrest','search','seizure','interview','identification','digital event','discovery production','hearing','motion','order','other'];
  view.innerHTML = `<h1>Timeline</h1><p class="sub">Chronology of the case, from incident through motion practice.</p>
  <div class="panel"><button class="gold" id="newT">＋ Add event</button></div>
  <div class="panel">${rows.length?rows.map(t=>`<div class="row" style="border-bottom:1px solid var(--line);padding:8px 0">
    <div style="min-width:120px" class="mono">${esc(t.event_date||'-')} ${esc(t.event_time||'')}</div>
    <div class="grow"><b>${esc(t.title)}</b> <span class="badge b-mut">${esc(t.event_type)}</span><br><span class="muted">${esc(t.description)}</span></div>
    <button class="link" data-ed="${t.id}">Edit</button></div>`).join(''):'<p class="muted mb0">No events yet.</p>'}</div>`;
  const tform = (t = {}) => {
    modal(`<h2>${t.id?'Edit event':'New event'}</h2><div class="grid2" id="tf">${formHtml([
      {k:'title',label:'Title'},{k:'event_type',label:'Type',type:'select',options:TYPES},
      {k:'event_date',label:'Date',type:'date'},{k:'event_time',label:'Time',type:'time'},
      {k:'description',label:'Description',type:'textarea'},
    ], t)}</div><div class="row"><button class="primary" id="tSave">Save</button>${t.id?'<button class="danger" id="tDel">Delete</button>':''}</div>`);
    $('#tSave').onclick = async () => {
      const b = readForm($('#tf'));
      if (t.id) await api('/api/timeline/' + t.id, { method: 'PUT', body: b });
      else await api(`/api/cases/${S.caseId}/timeline`, { method: 'POST', body: b });
      closeModal(); route();
    };
    if (t.id) $('#tDel').onclick = async () => { await api('/api/timeline/' + t.id, { method: 'DELETE' }); closeModal(); route(); };
  };
  $('#newT').onclick = () => tform();
  view.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => tform(rows.find(t => t.id === b.dataset.ed)));
}

/* ---------- motion analysis (board) ---------- */
async function analysis(view) {
  if (needCase(view)) return;
  const motions = await api(`/api/cases/${S.caseId}/motions`);
  const lanes = { 'Draft Now': [], 'Needs More Facts': [], 'Not Supported Yet': [] };
  const other = [];
  for (const m of motions) (lanes[m.status] ? lanes[m.status] : other).push(m);
  const card = m => `<div class="mcard" data-m="${m.id}"><b>${esc(m.title)}</b><small>${esc(m.category)}</small></div>`;
  view.innerHTML = `<h1>Motion Analysis</h1>
  <p class="sub">Rule-based engine matched against the ARC Motion Bank (154 Massachusetts motion theories). Classifications derive only from facts counsel entered - nothing is invented.</p>
  <div class="panel row"><button class="gold" id="run">Run analysis</button>
  <span class="muted">Re-running adds newly supported motions and never overwrites your edits.</span></div>
  <div class="board">
    <div class="lane draft"><h3>Draft Now <span>${lanes['Draft Now'].length}</span></h3>${lanes['Draft Now'].map(card).join('')}</div>
    <div class="lane needs"><h3>Needs More Facts <span>${lanes['Needs More Facts'].length}</span></h3>${lanes['Needs More Facts'].map(card).join('')}</div>
    <div class="lane notyet"><h3>Not Supported Yet <span>${lanes['Not Supported Yet'].length}</span></h3>${lanes['Not Supported Yet'].map(card).join('')}</div>
  </div>
  ${other.length?`<div class="panel" style="margin-top:16px"><h2>In drafting or beyond</h2>${other.map(m=>`<div class="row" style="border-bottom:1px solid var(--line);padding:6px 0"><div class="grow"><b>${esc(m.title)}</b> <span class="badge b-info">${esc(m.status)}</span></div><button class="link" data-m="${m.id}">Open</button></div>`).join('')}</div>`:''}`;
  $('#run').onclick = async () => {
    const r = await api(`/api/cases/${S.caseId}/recommend`, { method: 'POST', body: {} });
    toast(`${r.created} new recommendation(s); ${r.total} motions evaluated`, 'ok'); route();
  };
  view.querySelectorAll('[data-m]').forEach(el => el.onclick = () => motionDetail(el.dataset.m));
}
async function motionDetail(id) {
  const m = await api('/api/motions/' + id);
  const STATUSES = ['Recommended','Draft Now','Needs More Facts','Not Supported Yet','Drafting','Attorney Editing','Facts to Verify','Authorities to Verify','Exhibits to Review','Ready for Final Review','Approved for Filing','Filed','Denied','Allowed','Withdrawn','Archived'];
  modal(`<h2>${esc(m.title)}</h2>
  <p><span class="badge b-info">${esc(m.status)}</span> <span class="badge b-mut">${esc(m.category)}</span> <span class="badge b-mut">${esc(m.confidence)}</span></p>
  ${m.factual_basis?`<h2>Factual basis</h2><p style="white-space:pre-wrap">${esc(m.factual_basis)}</p>`:''}
  ${m.missing_facts?`<div class="notice n-warn"><b>Missing facts:</b> ${esc(m.missing_facts)}</div>`:''}
  ${m.legal_issues?`<h2>Motion theory</h2><p>${esc(m.legal_issues)}</p>`:''}
  ${m.potential_authorities?`<h2>Potential authorities <span class="badge b-warn">verify before citing</span></h2><p>${esc(m.potential_authorities)}</p>`:''}
  ${m.requested_relief?`<p><b>Requested relief:</b> ${esc(m.requested_relief)}</p>`:''}
  <div class="notice n-warn mb0">${esc(m.risks||'Confirm every factual assertion and check every authority before filing.')}</div>
  <div class="row" style="margin-top:14px">
    <select id="mSt" style="width:auto">${STATUSES.map(s=>`<option ${s===m.status?'selected':''}>${s}</option>`).join('')}</select>
    <button class="primary" id="mStSave">Update status</button>
    <button class="gold" id="mDraft">Open in Motion Builder</button>
    <button class="danger" id="mDel">Delete</button>
  </div>`);
  $('#mStSave').onclick = async () => {
    const status = $('#mSt').value;
    const body = { status };
    if (status === 'Approved for Filing') {
      const who = prompt('Approval requires explicit attorney action.\nType the approving attorney name:');
      if (!who) return;
      body.approved_by = who;
    }
    await api('/api/motions/' + id, { method: 'PUT', body }); closeModal(); toast('Status updated', 'ok'); route();
  };
  $('#mDraft').onclick = () => { closeModal(); location.hash = 'builder/' + id; };
  $('#mDel').onclick = async () => { if (confirm('Delete this motion and its sections?')) { await api('/api/motions/' + id, { method: 'DELETE' }); closeModal(); route(); } };
}

/* ---------- IRAC builder ---------- */
async function irac(view) {
  if (needCase(view)) return;
  const [blocks, motions] = await Promise.all([api(`/api/cases/${S.caseId}/irac`), api(`/api/cases/${S.caseId}/motions`)]);
  const mName = id => motions.find(m => m.id === id)?.title || '';
  view.innerHTML = `<h1>IRAC Builder</h1><p class="sub">Issue · Rule · Application · Conclusion. Each block converts to motion argument text on demand; missing sources are flagged, never papered over.</p>
  <div class="panel"><button class="gold" id="newI">＋ New IRAC block</button></div>
  <div class="panel"><table><tr><th>Label / Issue</th><th>Motion</th><th>Flags</th><th></th></tr>
  ${blocks.map(b=>`<tr><td><b>${esc(b.label||'(unlabeled)')}</b><br><span class="muted">${esc((b.issue||'').slice(0,120))}</span></td>
  <td>${esc(mName(b.motion_id))}</td><td>${b.flags?`<span class="badge b-warn">${esc(b.flags)}</span>`:''}</td>
  <td><button class="link" data-ed="${b.id}">Edit</button> <button class="link" data-dup="${b.id}">Duplicate</button> <button class="link" data-arg="${b.id}">→ Argument</button></td></tr>`).join('')||'<tr><td colspan="4" class="muted">No IRAC blocks yet.</td></tr>'}
  </table></div>`;
  const IRAC_FIELDS = [
    {k:'label',label:'Label'},{k:'motion_id',label:'MOTIONSELECT'},
    {k:'issue',label:'Issue - exact legal issue',type:'textarea'},{k:'issue_framing',label:'Defense framing',type:'textarea'},
    {k:'disputed_questions',label:'Disputed factual questions',type:'textarea'},
    {k:'standard_of_review',label:'Standard of review'},{k:'burden',label:'Burden of proof'},
    {k:'rule_constitutional',label:'Rule - constitutional provision',type:'textarea'},{k:'rule_statute',label:'Rule - statute',type:'textarea'},
    {k:'rule_crim_p',label:'Rule - rule of criminal procedure',type:'textarea'},{k:'rule_evidence',label:'Rule - evidence rule',type:'textarea'},
    {k:'rule_controlling',label:'Rule - controlling case',type:'textarea'},{k:'rule_supporting',label:'Rule - supporting case',type:'textarea'},
    {k:'rule_test',label:'Legal test',type:'textarea'},{k:'rule_elements',label:'Required elements',type:'textarea'},
    {k:'app_defense_facts',label:'Application - verified defense facts',type:'textarea'},
    {k:'app_commonwealth_allegations',label:'Application - Commonwealth allegations',type:'textarea'},
    {k:'app_conflicting_facts',label:'Application - conflicting facts',type:'textarea'},
    {k:'app_missing_evidence',label:'Application - missing evidence',type:'textarea'},
    {k:'app_element_application',label:'Application of each element',type:'textarea'},
    {k:'app_anticipated_commonwealth',label:'Anticipated Commonwealth argument',type:'textarea'},
    {k:'app_defense_response',label:'Defense response',type:'textarea'},
    {k:'concl_result',label:'Conclusion - specific result requested',type:'textarea'},
    {k:'concl_alternative',label:'Alternative relief',type:'textarea'},
    {k:'concl_order_language',label:'Proposed order language',type:'textarea'},
    {k:'attorney_notes',label:'Attorney notes (never exported)',type:'textarea'},
  ];
  const iform = (b = {}) => {
    modal(`<h2>${b.id?'Edit IRAC block':'New IRAC block'}</h2><div class="grid2" id="if">${IRAC_FIELDS.map(f=>{
      if (f.label==='MOTIONSELECT') return `<label class="f"><span>Attach to motion</span><select data-k="motion_id"><option value="">-</option>${motions.map(m=>`<option value="${m.id}" ${b.motion_id===m.id?'selected':''}>${esc(m.title)}</option>`).join('')}</select></label>`;
      return formHtml([f], b);
    }).join('')}</div>
    <div class="row"><button class="primary" id="iSave">Save block</button>${b.id?'<button class="danger" id="iDel">Delete</button>':''}</div>`);
    $('#iSave').onclick = async () => {
      const body = readForm($('#if'));
      if (b.id) await api('/api/irac/' + b.id, { method: 'PUT', body });
      else await api(`/api/cases/${S.caseId}/irac`, { method: 'POST', body });
      closeModal(); toast('IRAC saved', 'ok'); route();
    };
    if (b.id) $('#iDel').onclick = async () => { await api('/api/irac/' + b.id, { method: 'DELETE' }); closeModal(); route(); };
  };
  $('#newI').onclick = () => iform();
  view.querySelectorAll('[data-ed]').forEach(x => x.onclick = () => iform(blocks.find(b => b.id === x.dataset.ed)));
  view.querySelectorAll('[data-dup]').forEach(x => x.onclick = async () => {
    const b = { ...blocks.find(y => y.id === x.dataset.dup) };
    delete b.id; b.label = (b.label || 'IRAC') + ' (copy)';
    await api(`/api/cases/${S.caseId}/irac`, { method: 'POST', body: b }); toast('Duplicated', 'ok'); route();
  });
  view.querySelectorAll('[data-arg]').forEach(x => x.onclick = async () => {
    const b = blocks.find(y => y.id === x.dataset.arg);
    const r = await api(`/api/irac/${b.id}/to-argument`, { method: 'POST', body: {} });
    if (!b.motion_id) { modal(`<h2>Generated argument</h2><p class="muted">Attach this block to a motion to insert directly.</p><textarea style="min-height:300px">${esc(r.body)}</textarea>`); return; }
    await api(`/api/motions/${b.motion_id}/sections`, { method: 'POST', body: { section_type: 'irac', heading: r.heading, body: r.body, irac_id: b.id, sort_order: 50 } });
    toast('Argument section inserted into ' + mName(b.motion_id) + (r.flags.length ? ' - flags: ' + r.flags.join(', ') : ''), r.flags.length ? 'warn' : 'ok');
  });
}

/* ---------- motion builder ---------- */
const SECTION_TYPES = ['introduction','procedural_history','facts','legal_standard','argument','irac','relief','conclusion','affidavit','proposed_order','caption','title','signature','certificate','exhibit_index'];
async function builder(view, motionId) {
  if (needCase(view)) return;
  const motions = await api(`/api/cases/${S.caseId}/motions`);
  if (!motionId) {
    view.innerHTML = `<h1>Motion Builder</h1><p class="sub">Pick a motion to draft, or start a blank one.</p>
    <div class="panel row"><button class="gold" id="blank">＋ Blank motion</button>
    <select id="fromBank" style="max-width:420px"><option value="">Start from the ARC Motion Bank…</option></select></div>
    <div class="panel"><table><tr><th>Motion</th><th>Status</th><th>Updated</th><th></th></tr>
    ${motions.map(m=>`<tr><td><b>${esc(m.title)}</b></td><td><span class="badge b-info">${esc(m.status)}</span></td>
    <td class="mono">${esc(m.updated_at.slice(0,10))}</td><td><button class="link" data-b="${m.id}">Draft</button></td></tr>`).join('')||'<tr><td colspan="4" class="muted">No motions yet - run Motion Analysis or start blank.</td></tr>'}</table></div>`;
    const bank = await api('/api/motion-bank');
    $('#fromBank').innerHTML += bank.map(e => `<option value="${e.id}">${esc(e.title)}</option>`).join('');
    $('#fromBank').onchange = async () => {
      const e = bank.find(x => String(x.id) === $('#fromBank').value);
      if (!e) return;
      const m = await api(`/api/cases/${S.caseId}/motions`, { method: 'POST', body: { title: e.title, category: e.category, status: 'Drafting', legal_issues: e.theory, potential_authorities: e.authorities.join('; '), requested_relief: e.relief } });
      location.hash = 'builder/' + m.id;
    };
    $('#blank').onclick = async () => {
      const title = prompt('Motion title:'); if (!title) return;
      const m = await api(`/api/cases/${S.caseId}/motions`, { method: 'POST', body: { title, status: 'Drafting' } });
      location.hash = 'builder/' + m.id;
    };
    view.querySelectorAll('[data-b]').forEach(b => b.onclick = () => location.hash = 'builder/' + b.dataset.b);
    return;
  }
  const m = await api('/api/motions/' + motionId);
  const checks = await api(`/api/motions/${motionId}/checks`);
  view.innerHTML = `<h1 style="font-size:20px">${esc(m.title)}</h1>
  <p class="sub"><span class="badge b-info">${esc(m.status)}</span> · <a href="#builder">← all motions</a></p>
  ${checks.map(c=>`<div class="notice ${c.level==='error'?'n-bad':'n-warn'}">${esc(c.msg)}</div>`).join('')}
  <div class="panel row">
    <select id="addType" style="width:auto">${SECTION_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
    <button class="primary" id="addSec">＋ Add section</button>
    <button id="seed">Seed standard structure</button>
    <button id="snap">Save version snapshot</button>
    <span class="grow"></span>
    <button id="prev">Preview</button>
    <a class="btn" href="/api/motions/${m.id}/export/html">HTML</a>
    <a class="btn" href="/api/motions/${m.id}/export/docx">DOCX</a>
    <a class="btn" href="/api/motions/${m.id}/export/pdf">PDF</a>
    <a class="btn gold" href="/api/motions/${m.id}/export/zip">Filing ZIP</a>
  </div>
  <div id="secs">${m.sections.map(s=>secEditor(s)).join('')||'<div class="panel muted">No sections yet. Caption, title, signature block, and certificate of service are generated automatically from the case and attorney profile - add the body sections here. “Seed standard structure” creates the usual skeleton.</div>'}</div>
  <div class="panel"><h2>Placeholders</h2><p class="muted mb0">Type placeholders in CAPS inside brackets - e.g. [OFFICER NAME], [DATE], [FACTUAL SUPPORT REQUIRED]. They stay visible and block a clean filing check until resolved. Never fill a placeholder with invented information.</p></div>`;
  function secEditor(s) {
    return `<div class="panel" data-sec="${s.id}"><div class="row" style="margin-bottom:8px">
      <span class="badge b-mut">${esc(s.section_type)}</span>
      <input data-h value="${esc(s.heading)}" placeholder="Heading (optional)" style="max-width:320px">
      <input data-o value="${s.sort_order}" type="number" style="width:74px" title="Order">
      <span class="grow"></span>
      <button class="link" data-save>Save</button><button class="link" data-del>Delete</button></div>
      <textarea data-b style="min-height:130px;font-family:${s.section_type==='caption'?'var(--mono)':'var(--serif)'};font-size:14px">${esc(s.body)}</textarea></div>`;
  }
  $('#addSec').onclick = async () => {
    await api(`/api/motions/${m.id}/sections`, { method: 'POST', body: { section_type: $('#addType').value, sort_order: m.sections.length * 10 + 10 } });
    route();
  };
  $('#seed').onclick = async () => {
    const seedSecs = [
      ['introduction','INTRODUCTION',`Now comes the Defendant, [CLIENT NAME], and respectfully moves this Honorable Court as set forth below. ${m.legal_issues||''}`,10],
      ['procedural_history','PROCEDURAL HISTORY','[PROCEDURAL HISTORY]',20],
      ['facts','STATEMENT OF FACTS','[STATEMENT OF FACTS - insert verified facts with sources]',30],
      ['legal_standard','LEGAL STANDARD',(m.potential_authorities?`[VERIFY BEFORE CITING] Potential authorities identified by the ARC Motion Bank: ${m.potential_authorities}`:'[LEGAL STANDARD]'),40],
      ['argument','ARGUMENT','[ARGUMENT - insert IRAC sections from the IRAC Builder]',50],
      ['relief','REQUESTED RELIEF',`WHEREFORE, the Defendant respectfully requests that this Honorable Court enter an order ${m.requested_relief||'[REQUESTED RELIEF]'}.`,60],
    ];
    for (const [t, h, b, o] of seedSecs) await api(`/api/motions/${m.id}/sections`, { method: 'POST', body: { section_type: t, heading: h, body: b, sort_order: o } });
    toast('Standard structure created', 'ok'); route();
  };
  $('#snap').onclick = async () => { await api(`/api/motions/${m.id}/snapshot`, { method: 'POST', body: { label: 'manual' } }); toast('Snapshot saved', 'ok'); };
  $('#prev').onclick = () => modal(`<h2>Preview</h2><iframe class="preview" src="/api/motions/${m.id}/preview"></iframe>`);
  view.querySelectorAll('[data-sec]').forEach(panel => {
    const id = panel.dataset.sec;
    panel.querySelector('[data-save]').onclick = async () => {
      await api('/api/sections/' + id, { method: 'PUT', body: { heading: panel.querySelector('[data-h]').value, body: panel.querySelector('[data-b]').value, sort_order: +panel.querySelector('[data-o]').value } });
      toast('Section saved', 'ok');
    };
    panel.querySelector('[data-del]').onclick = async () => { if (confirm('Delete section?')) { await api('/api/sections/' + id, { method: 'DELETE' }); route(); } };
  });
}

/* ---------- full motions ---------- */
async function fullmotions(view) {
  if (needCase(view)) return;
  const motions = await api(`/api/cases/${S.caseId}/motions`);
  view.innerHTML = `<h1>Full Motions</h1><p class="sub">Every motion in the case with status, rulings, and export access.</p>
  <div class="panel row"><input id="q" placeholder="Search motions…" style="max-width:300px">
  <select id="fSt" style="width:auto"><option value="">All statuses</option>${[...new Set(motions.map(m=>m.status))].map(s=>`<option>${s}</option>`).join('')}</select></div>
  <div class="panel"><table id="tbl"><tr><th>Motion</th><th>Category</th><th>Status</th><th>Ruling</th><th>Filed</th><th></th></tr>
  ${motions.map(m=>`<tr data-t="${esc((m.title+' '+m.category+' '+m.status).toLowerCase())}" data-s="${esc(m.status)}">
  <td><b>${esc(m.title)}</b>${m.approved_by?`<br><small class="muted">Approved by ${esc(m.approved_by)} ${esc((m.approved_at||'').slice(0,10))}</small>`:''}</td>
  <td>${esc(m.category)}</td><td><span class="badge b-info">${esc(m.status)}</span></td><td>${esc(m.court_ruling)}</td><td>${esc(m.filing_date)}</td>
  <td><button class="link" data-o="${m.id}">Details</button> <a class="btn" href="/api/motions/${m.id}/export/pdf">PDF</a></td></tr>`).join('')}</table></div>`;
  const filter = () => {
    const q = $('#q').value.toLowerCase(), st = $('#fSt').value;
    view.querySelectorAll('#tbl tr[data-t]').forEach(tr => tr.style.display = (tr.dataset.t.includes(q) && (!st || tr.dataset.s === st)) ? '' : 'none');
  };
  $('#q').oninput = filter; $('#fSt').onchange = filter;
  view.querySelectorAll('[data-o]').forEach(b => b.onclick = () => motionDetail(b.dataset.o));
}

/* ---------- exhibits ---------- */
async function exhibits(view) {
  if (needCase(view)) return;
  const [rows, motions, docs, imgs] = await Promise.all([
    api(`/api/cases/${S.caseId}/exhibits`), api(`/api/cases/${S.caseId}/motions`),
    api(`/api/cases/${S.caseId}/documents`), api(`/api/cases/${S.caseId}/images`)]);
  const label = e => e.label || ({ alpha: 'Exhibit ' + String.fromCharCode(64 + (e.number_value||1)), defendant_alpha: "Defendant's Exhibit " + String.fromCharCode(64 + (e.number_value||1)), motion_numeric: 'Motion Exhibit ' + e.number_value }[e.numbering_scheme] || 'Exhibit ' + e.number_value);
  view.innerHTML = `<h1>Exhibits</h1><p class="sub">Cover pages, indexes, and numbering are generated automatically. Renumbering updates references in motion text.</p>
  <div class="panel"><button class="gold" id="newE">＋ Add exhibit</button></div>
  <div class="panel"><table><tr><th>Label</th><th>Title / Description</th><th>Motion</th><th>Bates</th><th>Status</th><th></th></tr>
  ${rows.map(e=>`<tr><td><b>${esc(label(e))}</b>${e.confidential?' <span class="badge b-bad">confidential</span>':''}</td>
  <td>${esc(e.title||e.description)}</td><td>${esc(motions.find(m=>m.id===e.motion_id)?.title||'')}</td>
  <td>${esc(e.bates)}</td><td><span class="badge b-mut">${esc(e.admission_status)}</span></td>
  <td><button class="link" data-ed="${e.id}">Edit</button></td></tr>`).join('')||'<tr><td colspan="6" class="muted">No exhibits.</td></tr>'}</table></div>`;
  const eform = (e = {}) => {
    modal(`<h2>${e.id?'Edit exhibit':'New exhibit'}</h2><div class="grid2" id="ef">${formHtml([
      {k:'title',label:'Title'},{k:'numbering_scheme',label:'Numbering',type:'select',options:['numeric','alpha','defendant_alpha','motion_numeric']},
      {k:'number_value',label:'Number',type:'number'},{k:'bates',label:'Bates'},
      {k:'exhibit_date',label:'Date',type:'date'},{k:'source_person',label:'Source / photographer'},
      {k:'admission_status',label:'Status',type:'select',options:['proposed','admitted','excluded','withdrawn']},
      {k:'confidential',label:'Confidential',type:'check'},
      {k:'description',label:'Description',type:'textarea'},{k:'authentication_notes',label:'Authentication notes',type:'textarea'},
      {k:'custody_notes',label:'Chain-of-custody notes',type:'textarea'},{k:'attorney_notes',label:'Attorney-only notes (never exported)',type:'textarea'},
    ], e)}
    <label class="f"><span>Attach to motion</span><select data-k="motion_id"><option value="">-</option>${motions.map(m=>`<option value="${m.id}" ${e.motion_id===m.id?'selected':''}>${esc(m.title)}</option>`).join('')}</select></label>
    <label class="f"><span>Source document</span><select data-k="source_document_id"><option value="">-</option>${docs.map(d=>`<option value="${d.id}" ${e.source_document_id===d.id?'selected':''}>${esc(d.original_filename)}</option>`).join('')}</select></label>
    <label class="f"><span>Source image (Picture Center)</span><select data-k="image_id"><option value="">-</option>${imgs.map(i=>`<option value="${i.id}" ${e.image_id===i.id?'selected':''}>${esc(i.caption||i.file_path.split(/[\\/]/).pop())}</option>`).join('')}</select></label>
    </div><div class="row"><button class="primary" id="eSave">Save exhibit</button>${e.id?'<button class="danger" id="eDel">Delete</button>':''}</div>`);
    $('#eSave').onclick = async () => {
      const b = readForm($('#ef'));
      if (e.id) await api('/api/exhibits/' + e.id, { method: 'PUT', body: b });
      else await api(`/api/cases/${S.caseId}/exhibits`, { method: 'POST', body: b });
      closeModal(); toast('Exhibit saved', 'ok'); route();
    };
    if (e.id) $('#eDel').onclick = async () => { await api('/api/exhibits/' + e.id, { method: 'DELETE' }); closeModal(); route(); };
  };
  $('#newE').onclick = () => eform();
  view.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => eform(rows.find(e => e.id === b.dataset.ed)));
}

/* ---------- picture center ---------- */
async function pictures(view) {
  if (needCase(view)) return;
  const imgs = await api(`/api/cases/${S.caseId}/images`);
  view.innerHTML = `<h1>Picture Center</h1><p class="sub">Direct image uploads with source metadata and hashes. Originals are never modified. External web images are disabled.</p>
  <div class="panel row"><input type="file" id="iu" multiple accept=".jpg,.jpeg,.png,.webp,.tif,.tiff" style="width:auto"><button class="primary" id="iuBtn">Upload images</button></div>
  <div class="thumbs">${imgs.map(i=>`<div class="thumb"><img src="/api/images/${i.id}/file" alt="${esc(i.caption||'case image')}">
  <small>${esc(i.caption||'(no caption)')}</small><small class="mono">${esc(i.sha256.slice(0,10))}…</small>
  <button class="link" data-ed="${i.id}">Details</button></div>`).join('')||'<p class="muted">No images.</p>'}</div>`;
  $('#iuBtn').onclick = async () => {
    const files = $('#iu').files;
    if (!files.length) return toast('Choose images first', 'warn');
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    await api(`/api/cases/${S.caseId}/images`, { method: 'POST', body: fd });
    toast('Uploaded', 'ok'); route();
  };
  view.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
    const i = imgs.find(x => x.id === b.dataset.ed);
    modal(`<h2>Image details</h2><img src="/api/images/${i.id}/file" style="max-width:100%;max-height:340px"><div class="grid2" id="imf">${formHtml([
      {k:'caption',label:'Caption'},{k:'date_shown',label:'Date shown or alleged',type:'date'},
      {k:'people_shown',label:'People shown'},{k:'location_shown',label:'Location shown'},
      {k:'relevance',label:'Relevance',type:'textarea'},{k:'description',label:'Description',type:'textarea'},
      {k:'authentication_issues',label:'Authentication issues',type:'textarea'},{k:'custody_notes',label:'Chain-of-custody notes',type:'textarea'},
      {k:'attorney_verified',label:'Attorney verified',type:'check'},
    ], i)}</div><button class="primary" id="imSave">Save</button>`);
    $('#imSave').onclick = async () => { await api('/api/images/' + i.id, { method: 'PUT', body: readForm($('#imf')) }); closeModal(); toast('Saved', 'ok'); route(); };
  });
}

/* ---------- filing packets ---------- */
async function packets(view) {
  if (needCase(view)) return;
  const motions = await api(`/api/cases/${S.caseId}/motions`);
  view.innerHTML = `<h1>Filing Packets</h1><p class="sub">Pre-filing checks run on every packet: placeholders, unverified facts and authorities, exhibit references, caption consistency, Rule 9A bleed-through.</p>
  <div class="panel"><table><tr><th>Motion</th><th>Status</th><th>Checks</th><th>Exports</th></tr>
  ${motions.map(m=>`<tr><td><b>${esc(m.title)}</b></td><td><span class="badge b-info">${esc(m.status)}</span></td>
  <td><button class="link" data-c="${m.id}">Run checks</button></td>
  <td><a class="btn" href="/api/motions/${m.id}/export/packet">Exhibit packet PDF</a> <a class="btn gold" href="/api/motions/${m.id}/export/zip">Filing ZIP</a></td></tr>`).join('')||'<tr><td colspan="4" class="muted">No motions.</td></tr>'}</table></div>
  <div class="panel"><h2>Case backup</h2><div class="row"><button class="primary" id="bk">Create full case backup</button><span class="muted">Backups include originals, database records, and audit history. API keys are never included.</span></div>
  <div id="bkList" style="margin-top:10px"></div></div>`;
  view.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => {
    const checks = await api(`/api/motions/${b.dataset.c}/checks`);
    modal(`<h2>Pre-filing checks</h2>${checks.length?checks.map(c=>`<div class="notice ${c.level==='error'?'n-bad':'n-warn'}">${esc(c.msg)}</div>`).join(''):'<div class="notice n-ok">All checks passed.</div>'}`);
  });
  $('#bk').onclick = async () => { const r = await api(`/api/cases/${S.caseId}/backup`, { method: 'POST', body: {} }); toast('Backup created: ' + r.filename, 'ok'); loadBk(); };
  async function loadBk() {
    const rows = await api('/api/backups');
    $('#bkList').innerHTML = rows.length ? rows.map(b => `<div class="mono" style="padding:2px 0">${esc(b.filename)} · ${(b.size/1024).toFixed(0)} KB</div>`).join('') : '<span class="muted">No backups yet.</span>';
  }
  loadBk();
}

/* ---------- legal research ---------- */
async function research(view) {
  if (needCase(view)) return;
  const rows = await api(`/api/cases/${S.caseId}/authorities`);
  const STATUSES = ['Verified Current','Verification Required','Potentially Superseded','Overruled','Limited','Secondary Source Only','Do Not Cite'];
  const sb = s => ({'Verified Current':'b-ok','Verification Required':'b-warn','Overruled':'b-bad','Do Not Cite':'b-bad','Potentially Superseded':'b-warn','Limited':'b-warn','Secondary Source Only':'b-mut'}[s]||'b-mut');
  view.innerHTML = `<h1>Legal Research</h1><p class="sub">Authority library for this case. Nothing is citable until counsel verifies it. Massachusetts law first; controlling vs. persuasive tracked on every record.</p>
  <div class="panel"><button class="gold" id="newA">＋ Add authority</button></div>
  <div class="panel"><table><tr><th>Authority</th><th>Citation</th><th>Level</th><th>Status</th><th>Verified</th><th></th></tr>
  ${rows.map(a=>`<tr><td><b>${esc(a.name)}</b><br><span class="muted">${esc((a.proposition||'').slice(0,110))}</span></td>
  <td class="mono">${esc(a.citation)}${a.pinpoint?', '+esc(a.pinpoint):''}</td><td>${esc(a.level)}</td>
  <td><span class="badge ${sb(a.status)}">${esc(a.status)}</span></td>
  <td>${a.attorney_verified?'<span class="badge b-ok">✓ counsel</span>':'<span class="badge b-warn">no</span>'}</td>
  <td><button class="link" data-ed="${a.id}">Edit</button></td></tr>`).join('')||'<tr><td colspan="6" class="muted">No authorities recorded.</td></tr>'}</table></div>`;
  const aform = (a = {}) => {
    modal(`<h2>${a.id?'Edit authority':'New authority'}</h2><div class="grid2" id="af">${formHtml([
      {k:'name',label:'Authority name'},{k:'citation',label:'Full citation'},{k:'pinpoint',label:'Pinpoint'},
      {k:'year',label:'Year'},{k:'court',label:'Court'},{k:'jurisdiction',label:'Jurisdiction'},
      {k:'level',label:'Authority level',type:'select',options:['','controlling','persuasive','secondary','unverified']},
      {k:'status',label:'Status',type:'select',options:STATUSES},
      {k:'topic',label:'Topic'},{k:'motion_type',label:'Motion type'},
      {k:'date_checked',label:'Date checked',type:'date'},{k:'cite_check_status',label:'Cite-check status'},
      {k:'source',label:'Source'},{k:'url',label:'URL'},
      {k:'proposition',label:'Proposition',type:'textarea'},{k:'quotation',label:'Relevant quotation',type:'textarea'},
      {k:'attorney_verified',label:'Attorney verified',type:'check'},
      {k:'notes',label:'Notes',type:'textarea'},
    ], a)}</div><div id="aWarn"></div>
    <div class="row"><button class="primary" id="aSave">Save authority</button>${a.id?'<button class="danger" id="aDel">Delete</button>':''}</div>`);
    $('#aSave').onclick = async () => {
      const b = readForm($('#af'));
      if (!b.name) return toast('Authority name is required', 'bad');
      const r = a.id ? await api('/api/authorities/' + a.id, { method: 'PUT', body: b })
                     : await api(`/api/cases/${S.caseId}/authorities`, { method: 'POST', body: b });
      if (r.warnings?.length) { $('#aWarn').innerHTML = r.warnings.map(w => `<div class="notice n-warn">${esc(w)}</div>`).join(''); toast('Saved with warnings', 'warn'); }
      else { closeModal(); toast('Authority saved', 'ok'); }
      route();
    };
    if (a.id) $('#aDel').onclick = async () => { await api('/api/authorities/' + a.id, { method: 'DELETE' }); closeModal(); route(); };
  };
  $('#newA').onclick = () => aform();
  view.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => aform(rows.find(a => a.id === b.dataset.ed)));
}

/* ---------- knowledge library ---------- */
async function knowledge(view) {
  const k = await api('/api/knowledge');
  const groups = {};
  for (const f of k.files) {
    const g = f.path.includes('/') || f.path.includes('\\') ? f.path.split(/[\\/]/)[0] : '(root)';
    (groups[g] ||= []).push(f);
  }
  view.innerHTML = `<h1>Knowledge Library</h1>
  <div class="notice n-warn">${esc(k.warning)}</div>
  ${Object.entries(groups).map(([g, files]) => `<div class="panel"><h2>${esc(g.replace(/_/g,' '))}${g==='civil_reference'?' <span class="badge b-bad">Civil reference - not for automatic criminal use</span>':''}</h2>
  ${files.map(f=>`<div class="row" style="padding:3px 0"><a href="/api/knowledge/file?path=${encodeURIComponent(f.path)}" target="_blank">${esc(f.path.split(/[\\/]/).pop())}</a><span class="muted">${(f.size/1024).toFixed(0)} KB</span></div>`).join('')}</div>`).join('')}`;
}

/* ---------- attorney profile ---------- */
async function profile(view) {
  const rows = await api('/api/profiles');
  const PF = [
    {k:'name',label:'Attorney name'},{k:'bbo',label:'BBO number'},{k:'firm',label:'Firm'},{k:'phone',label:'Phone'},
    {k:'address',label:'Address'},{k:'email',label:'Email'},{k:'city',label:'City'},{k:'state',label:'State'},{k:'zip',label:'ZIP'},
    {k:'default_court',label:'Default court'},
    {k:'default_exhibit_numbering',label:'Default exhibit numbering',type:'select',options:['numeric','alpha','defendant_alpha','motion_numeric']},
    {k:'is_default',label:'Default profile',type:'check'},
    {k:'signature_block',label:'Signature block (used exactly as saved - leave blank to auto-generate)',type:'textarea'},
    {k:'cert_service_language',label:'Certificate of service language (leave blank for standard placeholder text)',type:'textarea'},
  ];
  view.innerHTML = `<h1>Attorney Profile</h1><p class="sub">The signature block is reproduced in filings exactly as saved here - never reformatted.</p>
  <div class="panel"><button class="gold" id="newPr">＋ New profile</button></div>
  ${rows.map(p=>`<div class="panel"><h2>${esc(p.name)} ${p.is_default?'<span class="badge b-ok">default</span>':''}</h2>
  <p class="muted">BBO ${esc(p.bbo||'-')} · ${esc(p.firm||'')} · ${esc(p.email||'')}</p>
  <button class="link" data-ed="${p.id}">Edit</button></div>`).join('')||'<div class="panel muted">No profiles.</div>'}`;
  const pform = (p = {}) => {
    modal(`<h2>${p.id?'Edit profile':'New profile'}</h2><div class="grid2" id="prf">${formHtml(PF, p)}</div>
    <button class="primary" id="prSave">Save profile</button>`);
    $('#prSave').onclick = async () => {
      const b = readForm($('#prf'));
      if (!b.name) return toast('Name required', 'bad');
      if (p.id) await api('/api/profiles/' + p.id, { method: 'PUT', body: b });
      else await api('/api/profiles', { method: 'POST', body: b });
      closeModal(); toast('Profile saved', 'ok'); S.profiles = await api('/api/profiles'); route();
    };
  };
  $('#newPr').onclick = () => pform();
  view.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => pform(rows.find(p => p.id === b.dataset.ed)));
}

/* ---------- settings ---------- */
async function settings(view) {
  const st = await api('/api/state');
  view.innerHTML = `<h1>Settings</h1>
  <div class="panel"><h2>AI assistance</h2>
  <p>${st.aiConfigured?'<span class="badge b-ok">AI provider configured (server-side key)</span>':'<span class="badge b-mut">AI not configured</span>'}</p>
  <p class="muted">AI is optional and disabled unless a key is set in <span class="mono">.env</span> on the server (ARC_AI_KEY / ARC_AI_PROVIDER).
  Keys never appear in the browser. Every AI response is an unverified proposal: it requires source citations for factual content,
  never adds citations to filings, and must be accepted or rejected by counsel.</p></div>
  <div class="panel"><h2>Data location</h2>
  <p class="mono">data/ - cases, database, backups (relative to the application folder; move the folder and everything moves with it)</p>
  <p class="muted">The application binds to 127.0.0.1 only. Do not expose it to a public network. See SECURITY.md.</p></div>
  <div class="panel"><h2>Reference</h2><p class="muted mb0">Rules, statutes, cases, standing orders, and local filing procedures must be checked for amendments or changes before filing. The bundled Rules of Criminal Procedure incorporate amendments effective November 1, 2025 and are not guaranteed current after that date.</p></div>`;
}

/* ---------- audit ---------- */
async function audit(view) {
  const rows = S.caseId ? await api(`/api/cases/${S.caseId}/audit`) : await api('/api/audit');
  view.innerHTML = `<h1>Audit History</h1><p class="sub">${S.caseId?'Entries for the active case.':'All entries.'} Audit details never appear in exported motions.</p>
  <div class="panel"><table><tr><th>When</th><th>Action</th><th>Type</th><th>Summary</th><th>Change</th></tr>
  ${rows.map(r=>`<tr><td class="mono">${esc(r.at.slice(0,19).replace('T',' '))}</td><td>${esc(r.action)}</td><td>${esc(r.record_type)}</td>
  <td>${esc(r.summary)}</td><td class="mono">${r.prev_value&&r.prev_value!=='""'?esc(String(r.prev_value).slice(0,40))+' → ':''}${r.new_value&&r.new_value!=='""'?esc(String(r.new_value).slice(0,40)):''}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No entries.</td></tr>'}</table></div>`;
}

boot();
