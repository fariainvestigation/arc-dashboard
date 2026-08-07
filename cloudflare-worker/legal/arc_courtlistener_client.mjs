// CourtListener REST API v4 client. Runs ONLY inside the Cloudflare Worker.
// Token is sent as `Authorization: Token <COURTLISTENER_API_KEY>` and never leaves the Worker.
// Preserves the CourtListener object hierarchy: Court -> Docket -> Cluster -> Opinion.
import { now, uuid } from './lib.mjs';

const CL_BASE = 'https://www.courtlistener.com/api/rest/v4';
export const MA_COURTS = ['mass', 'massappct', 'massdistct', 'masssuperct', 'massland', 'massjuvct'];
const FED_COURTS = ['scotus', 'ca1', 'mad'];

// Field selection: request only what ARC stores (directive: do not download every field).
const F_DOCKET = 'id,court_id,case_name,docket_number,date_filed,date_terminated,jurisdiction_type,absolute_url,clusters';
const F_CLUSTER = 'id,docket,case_name,case_name_full,date_filed,citations,judges,panel,sub_opinions,absolute_url';
const F_OPINION = 'id,cluster,type,author_str,ordering_key,opinions_cited,html_with_citations,plain_text,html,xml_harvard,absolute_url,download_url';
const F_COURT = 'id,full_name,short_name,jurisdiction,in_use';

async function clFetch(env, path, actor = 'system', caseId = '') {
  const r = await fetch(CL_BASE + path, { headers: { Authorization: `Token ${env.COURTLISTENER_API_KEY}` } });
  const text = await r.text();
  await logProvider(env, actor, 'courtlistener', path.split('?')[0], caseId, path.length, text.length, r.ok);
  if (!r.ok) throw Object.assign(new Error(`CourtListener request failed (${r.status})`), { status: 502 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('CourtListener returned a non-JSON response'), { status: 502 }); }
}

export async function logProvider(env, actor, provider, route, caseId, reqChars, resChars, ok) {
  // Sizes and route only. Never the token, never raw prompts.
  try {
    await env.DB.prepare(`INSERT INTO provider_log (id, at, actor, provider, route, case_id, request_chars, response_chars, ok)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(uuid(), now(), actor, provider, route, caseId || '', reqChars | 0, resChars | 0, ok ? 1 : 0).run();
  } catch { /* logging must never break a request */ }
}

const idFromUri = uri => String(uri || '').replace(/\/$/, '').split('/').pop();

// ---- Courts -----------------------------------------------------------------
export async function clCourts(env, actor) {
  const cached = await env.DB.prepare('SELECT * FROM cl_courts LIMIT 1').first();
  if (cached && Date.now() - Date.parse(cached.cached_at || 0) < 30 * 86400e3) {
    const r = await env.DB.prepare('SELECT * FROM cl_courts ORDER BY name').all();
    return { cached: true, courts: r.results || [] };
  }
  const data = await clFetch(env, `/courts/?fields=${F_COURT}&page_size=500`, actor);
  const courts = (data.results || []).map(c => ({
    cl_court_id: c.id, name: c.full_name || '', abbreviation: c.short_name || '',
    jurisdiction: c.jurisdiction || '', court_level: courtLevel(c), in_use: c.in_use === undefined ? null : (c.in_use ? 1 : 0),
  }));
  for (const c of courts) {
    await env.DB.prepare(`INSERT INTO cl_courts (cl_court_id, name, abbreviation, jurisdiction, court_level, in_use, cached_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(cl_court_id) DO UPDATE SET name=excluded.name, abbreviation=excluded.abbreviation,
      jurisdiction=excluded.jurisdiction, court_level=excluded.court_level, in_use=excluded.in_use, cached_at=excluded.cached_at`)
      .bind(c.cl_court_id, c.name, c.abbreviation, c.jurisdiction, c.court_level, c.in_use, now()).run();
  }
  return { cached: false, courts };
}
function courtLevel(c) {
  const j = String(c.jurisdiction || '');
  if (j === 'F') return 'federal appellate';
  if (j === 'FD') return 'federal district';
  if (j === 'FS') return 'federal special';
  if (j === 'S') return 'state supreme';
  if (j === 'SA') return 'state appellate';
  if (j === 'ST') return 'state trial';
  return j;
}

// ---- Search -----------------------------------------------------------------
/**
 * Search opinions. Docket numbers are NOT unique, so a docket-number search
 * always carries a court or jurisdiction filter (enforced below).
 */
export async function clSearch(env, actor, body) {
  const { q = '', caseName = '', citation = '', docketNumber = '', court = '',
    dateAfter = '', dateBefore = '', jurisdiction = 'massachusetts-first', caseId = '' } = body || {};
  const terms = [q, caseName ? `caseName:(${caseName})` : '', citation ? `citation:(${citation})` : '',
    docketNumber ? `docketNumber:(${docketNumber})` : ''].filter(Boolean).join(' ').trim();
  if (!terms) throw Object.assign(new Error('Provide search terms, a case name, a citation, or a docket number.'), { status: 400 });

  let courtFilter = court;
  if (!courtFilter) {
    if (jurisdiction === 'massachusetts' || jurisdiction === 'massachusetts-first') courtFilter = MA_COURTS.join(' ');
    else if (jurisdiction === 'federal') courtFilter = FED_COURTS.join(' ');
  }
  if (docketNumber && !courtFilter) {
    throw Object.assign(new Error('Docket-number searches require a court or jurisdiction filter; docket numbers are not unique.'), { status: 400 });
  }
  const params = new URLSearchParams({ type: 'o', q: terms, order_by: 'score desc' });
  if (courtFilter) params.set('court', courtFilter);
  if (dateAfter) params.set('filed_after', dateAfter);
  if (dateBefore) params.set('filed_before', dateBefore);

  const data = await clFetch(env, `/search/?${params}`, actor, caseId);
  let results = (data.results || []).map(x => ({
    clusterId: String(x.cluster_id ?? x.id ?? ''),
    docketId: x.docket_id ? String(x.docket_id) : '',
    courtId: x.court_id || '',
    caseName: x.caseName || x.case_name || '',
    citation: Array.isArray(x.citation) ? x.citation.join('; ') : (x.citation || ''),
    court: x.court || x.court_id || '',
    dateFiled: x.dateFiled || x.date_filed || '',
    docketNumber: x.docketNumber || '',
    url: x.absolute_url ? 'https://www.courtlistener.com' + x.absolute_url : '',
    snippet: String(x.snippet || '').replace(/<[^>]+>/g, '').slice(0, 400),
  }));
  // Massachusetts-first ordering: MA courts float to the top, federal follows.
  if (jurisdiction === 'massachusetts-first') {
    results = results.sort((a, b) => (MA_COURTS.includes(b.courtId) ? 1 : 0) - (MA_COURTS.includes(a.courtId) ? 1 : 0));
  }
  return { count: data.count ?? results.length, jurisdictionFilter: courtFilter || 'all', results };
}

// ---- Docket -----------------------------------------------------------------
export async function clDocket(env, actor, docketId) {
  const d = await clFetch(env, `/dockets/${encodeURIComponent(docketId)}/?fields=${F_DOCKET}`, actor);
  const rec = {
    cl_docket_id: String(d.id), cl_court_id: d.court_id || idFromUri(d.court),
    case_name: d.case_name || '', docket_number: d.docket_number || '',
    date_filed: d.date_filed || '', date_terminated: d.date_terminated || '',
    jurisdiction_type: d.jurisdiction_type || '',
    absolute_url: d.absolute_url ? 'https://www.courtlistener.com' + d.absolute_url : '',
    cluster_ids: (d.clusters || []).map(idFromUri),
  };
  await env.DB.prepare(`INSERT INTO cl_dockets (cl_docket_id, cl_court_id, case_name, docket_number, date_filed,
    date_terminated, jurisdiction_type, absolute_url, cluster_ids, cached_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(cl_docket_id) DO UPDATE SET case_name=excluded.case_name, cluster_ids=excluded.cluster_ids, cached_at=excluded.cached_at`)
    .bind(rec.cl_docket_id, rec.cl_court_id, rec.case_name, rec.docket_number, rec.date_filed,
      rec.date_terminated, rec.jurisdiction_type, rec.absolute_url, JSON.stringify(rec.cluster_ids), now()).run();
  return rec;
}

// ---- Cluster (opinion-page URLs use the CLUSTER id) -------------------------
export async function clCluster(env, actor, clusterId) {
  const c = await clFetch(env, `/clusters/${encodeURIComponent(clusterId)}/?fields=${F_CLUSTER}`, actor);
  const rec = {
    cl_cluster_id: String(c.id), cl_docket_id: idFromUri(c.docket),
    case_name: c.case_name || c.case_name_full || '',
    date_filed: c.date_filed || '',
    citations: (c.citations || []).map(x => typeof x === 'string' ? x : `${x.volume} ${x.reporter} ${x.page}`.trim()),
    judges: c.judges || '',
    panel: (c.panel || []).map(idFromUri),
    opinion_ids: (c.sub_opinions || []).map(idFromUri),
    absolute_url: c.absolute_url ? 'https://www.courtlistener.com' + c.absolute_url : '',
  };
  await env.DB.prepare(`INSERT INTO cl_clusters (cl_cluster_id, cl_docket_id, case_name, date_filed, citations, judges,
    panel, opinion_ids, absolute_url, cached_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(cl_cluster_id) DO UPDATE SET case_name=excluded.case_name, citations=excluded.citations,
    opinion_ids=excluded.opinion_ids, cached_at=excluded.cached_at`)
    .bind(rec.cl_cluster_id, rec.cl_docket_id, rec.case_name, rec.date_filed, JSON.stringify(rec.citations),
      rec.judges, JSON.stringify(rec.panel), JSON.stringify(rec.opinion_ids), rec.absolute_url, now()).run();
  return rec;
}

// ---- Opinion ----------------------------------------------------------------
const TYPE_MAP = {
  '010combined': 'combined', '020lead': 'lead', '015unamimous': 'majority', '025plurality': 'plurality',
  '030concurrence': 'concurrence', '035concurrenceinpart': 'concurrence in part',
  '040dissent': 'dissent', '050addendum': 'addendum', '060rehearing': 'rehearing', '070onthemerits': 'on the merits',
};
export function normalizeOpinionType(t) {
  const key = String(t || '').toLowerCase();
  return TYPE_MAP[key] || key.replace(/^\d+/, '') || 'combined';
}
/** Prefer html_with_citations; fall back only when it is absent. */
export function pickOpinionText(op) {
  const order = ['html_with_citations', 'html_columbia', 'html_lawbox', 'html_anon_2020', 'html', 'xml_harvard', 'plain_text'];
  for (const f of order) {
    if (op[f]) return { field: f, text: String(op[f]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
  }
  return { field: '', text: '' };
}
export async function clOpinion(env, actor, opinionId) {
  const op = await clFetch(env, `/opinions/${encodeURIComponent(opinionId)}/?fields=${F_OPINION}`, actor);
  const picked = pickOpinionText(op);
  const rec = {
    cl_opinion_id: String(op.id), cl_cluster_id: idFromUri(op.cluster),
    opinion_type: normalizeOpinionType(op.type), author: op.author_str || '',
    ordering_key: op.ordering_key ?? null,
    opinions_cited: (op.opinions_cited || []).map(idFromUri),
    opinion_text: picked.text.slice(0, 200000), text_source_field: picked.field,
    source_url: op.absolute_url ? 'https://www.courtlistener.com' + op.absolute_url : '',
    download_url: op.download_url || '',
  };
  await env.DB.prepare(`INSERT INTO cl_opinions (cl_opinion_id, cl_cluster_id, opinion_type, author, ordering_key,
    opinions_cited, opinion_text, text_source_field, source_url, download_url, cached_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(cl_opinion_id) DO UPDATE SET opinion_text=excluded.opinion_text, text_source_field=excluded.text_source_field, cached_at=excluded.cached_at`)
    .bind(rec.cl_opinion_id, rec.cl_cluster_id, rec.opinion_type, rec.author, rec.ordering_key,
      JSON.stringify(rec.opinions_cited), rec.opinion_text, rec.text_source_field, rec.source_url, rec.download_url, now()).run();
  return rec;
}

/** Full hierarchy for a cluster: cluster + docket + court + every sub-opinion, types preserved. */
export async function clClusterFull(env, actor, clusterId) {
  const cluster = await clCluster(env, actor, clusterId);
  let docket = null, court = null;
  if (cluster.cl_docket_id) {
    try { docket = await clDocket(env, actor, cluster.cl_docket_id); } catch { /* docket optional */ }
  }
  if (docket?.cl_court_id) {
    court = await env.DB.prepare('SELECT * FROM cl_courts WHERE cl_court_id=?').bind(docket.cl_court_id).first();
  }
  const opinions = [];
  for (const oid of cluster.opinion_ids) {
    try { opinions.push(await clOpinion(env, actor, oid)); } catch { /* skip unavailable opinion */ }
  }
  return { court, docket, cluster, opinions };
}
