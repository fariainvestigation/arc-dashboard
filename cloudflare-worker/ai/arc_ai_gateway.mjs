/**
 * arc_ai_gateway.mjs - one AI entry point for every ARC module.
 *
 * Two providers, one rule:
 *   Claude  writes motions and the final report.
 *   Gemini  does everything else.
 *
 * The rule is enforced HERE, on the server, from the task name. A module cannot
 * choose its own provider, cannot send a raw model ID, and never holds a key.
 * Both keys are Worker secrets and neither is ever returned to a browser.
 *
 * Bindings:  DB (D1, for provider_log)
 * Secrets:   GOOGLE_API_KEY, ANTHROPIC_API_KEY
 * Vars:      ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_ORIGINS,
 *            CLAUDE_MODEL (default claude-sonnet-4-6)
 *
 * Routes:
 *   POST /ai/run        { task, payload }  -> provider chosen by task
 *   /ai/google/*         authenticated Gemini SDK passthrough (key injected server-side)
 *   GET  /ai/policy     the routing table, so a module can show what it uses
 */

import { verifyAccessJwt, json, now, uuid } from './lib.mjs';

/* ------------------------------------------------------------------ policy --
   Every task an ARC module may ask for. Adding a module means adding a line
   here; there is no default-allow. A task not in this table is refused.
   -------------------------------------------------------------------------- */
export const TASK_POLICY = {
  // Claude: the two places a document is written for a human to file or send.
  'motion.draft':          { provider: 'claude', roles: ['attorney', 'supervisor', 'administrator'] },
  'motion.revise':         { provider: 'claude', roles: ['attorney', 'supervisor', 'administrator'] },
  'report.final.draft':    { provider: 'claude', roles: ['investigator', 'supervisor', 'administrator', 'attorney'] },
  'report.final.revise':   { provider: 'claude', roles: ['investigator', 'supervisor', 'administrator', 'attorney'] },

  // Gemini: extraction, review, and analysis across every other module.
  'evidence.extract':      { provider: 'gemini', model: 'extract' },
  'discovery.review':      { provider: 'gemini', model: 'extract' },
  'custody.analyze':       { provider: 'gemini', model: 'extract' },
  'video.audit':           { provider: 'gemini', model: 'video' },
  'audio.transcribe':      { provider: 'gemini', model: 'audio' },
  'timeline.normalize':    { provider: 'gemini', model: 'extract' },
  'parties.extract':       { provider: 'gemini', model: 'extract' },
  'board.command':         { provider: 'gemini', model: 'extract' },
  'notebook.query':        { provider: 'gemini', model: 'extract' },
  'notebook.summarize':    { provider: 'gemini', model: 'extract' },
  'investigation.leads':   { provider: 'gemini', model: 'extract' },
  'oui.analyze':           { provider: 'gemini', model: 'extract' },
  'breath.analyze':        { provider: 'gemini', model: 'extract' },
  'lab.analyze':           { provider: 'gemini', model: 'extract' },
  'map.ground':            { provider: 'gemini', model: 'extract' },
  'intake.extract':        { provider: 'gemini', model: 'extract' },
  'report.review':         { provider: 'gemini', model: 'extract' },
  'pdf.review':            { provider: 'gemini', model: 'extract' },
};

/* Gemini model ladder, matching the shared browser client. A retired ID walks
   down the ladder rather than failing the module. */
const GEMINI_LADDER = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
const GEMINI_ROLES = { extract: 0, video: 0, audio: 0 };  // all start at the ladder head

const MAX_BODY = 2 * 1024 * 1024;

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, cf-access-jwt-assertion, x-arc-case-id, x-goog-upload-protocol, x-goog-upload-command, x-goog-upload-header-content-length, x-goog-upload-header-content-type, x-goog-upload-offset',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const CASE_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

async function requireCaseAccess(env, user, actor, caseId) {
  const id = String(caseId || '').trim();
  if (!CASE_ID_RE.test(id)) {
    throw Object.assign(new Error('A valid active ARC case is required for AI work.'), { status: 400 });
  }
  if (!env.DB) throw Object.assign(new Error('ARC case authorization database is unavailable.'), { status: 503 });
  if (user && ['administrator','supervisor'].includes(user.role)) return id;
  const member = await env.DB.prepare('SELECT role FROM case_members WHERE case_id=? AND user_id=?').bind(id, actor).first();
  if (!member) throw Object.assign(new Error('You are not assigned to this ARC case.'), { status: 403 });
  return id;
}

async function logProvider(env, { actor, provider, task, caseId, inChars, outChars, ok }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO provider_log (id, at, actor, provider, route, case_id, request_chars, response_chars, ok) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(uuid(), now(), actor, provider, task, caseId || '', inChars | 0, outChars | 0, ok ? 1 : 0).run();
  } catch (e) {
    /* logging must never fail a request */
  }
}

/* -------------------------------------------------------------- providers -- */

async function callClaude(env, { system, prompt, maxTokens }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: Math.min(Number(maxTokens) || 8000, 16000),
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw Object.assign(new Error('Claude request failed: ' + r.status), { status: 502, detail: detail.slice(0, 300) });
  }
  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw Object.assign(new Error('Claude returned an empty response.'), { status: 502 });
  return text;
}

async function callGemini(env, { system, prompt, parts, schema, jsonMode, startAt }) {
  const body = {
    contents: [{ role: 'user', parts: parts && parts.length ? parts : [{ text: String(prompt || '') }] }],
    generationConfig: {},
  };
  if (schema || jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
    if (schema) body.generationConfig.responseSchema = schema;
  }
  if (system) body.systemInstruction = { parts: [{ text: String(system) }] };

  const ladder = GEMINI_LADDER.slice(startAt || 0);
  let lastError = null;

  for (const model of ladder) {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_API_KEY },
        body: JSON.stringify(body),
      }
    );
    if (r.status === 404) { lastError = 'model ' + model + ' is retired'; continue; }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      throw Object.assign(new Error('Gemini request failed: ' + r.status), { status: 502, detail: detail.slice(0, 300) });
    }
    const data = await r.json();
    const blocked = data.promptFeedback && data.promptFeedback.blockReason;
    if (blocked) throw Object.assign(new Error('Gemini blocked this request (' + blocked + '). Nothing was returned.'), { status: 422 });
    const cand = (data.candidates || [])[0];
    if (!cand) throw Object.assign(new Error('Gemini returned no content.'), { status: 502 });
    if (cand.finishReason === 'MAX_TOKENS') {
      throw Object.assign(new Error('The response was cut off before completing. Split the input and rerun so no record is silently dropped.'), { status: 422 });
    }
    const text = (cand.content && cand.content.parts || []).map(p => p.text || '').join('').trim();
    if (!text) throw Object.assign(new Error('Gemini returned an empty response.'), { status: 502 });
    return { text, model };
  }
  throw Object.assign(new Error('Every Gemini model on the ladder was rejected: ' + lastError), { status: 502 });
}

/* ----------------------------------------------------- initial case analysis -- */
const IA_CLASSIFICATIONS = new Set(['DIRECT OBSERVATION','REPORTED STATEMENT','ALLEGATION','CORROBORATED FACT','DISPUTED FACT','DOCUMENTED PROCEDURAL ACTION','AI INFERENCE']);
const IA_DISCOVERY = new Set(['UPLOADED','REFERENCED','MISSING','PARTIAL','UNREADABLE','DUPLICATE','REQUIRES MANUAL REVIEW']);
const IA_TIMELINE = new Set(['CONFIRMED','CORROBORATED','REPORTED','DISPUTED','ESTIMATED','TIME NOT LISTED']);
const IA_USABLE = new Set(['READY','PARTIAL','OCR REQUIRED']);
const IA_MAX_DOCS = 40, IA_MAX_TOTAL = 400000, IA_MAX_DOC = 60000;
function iaClean(v,max=2000){return String(v==null?'':v).trim().slice(0,max)}
function iaArr(v){return Array.isArray(v)?v:[]}
function iaPages(text){const out=new Set();let m;const re=/\[Page (\d+)\]/g;while((m=re.exec(String(text||''))))out.add(m[1]);return out}
function iaPrompt(documents,caseFields){
  const blocks=documents.map(d=>['=== DOCUMENT START ===','documentId: '+d.documentId,'fileName: '+d.fileName,'documentType: '+(d.documentType||'UNCLASSIFIED REPORT'),'extractionStatus: '+d.extractionStatus,'pageCount: '+(d.pageCount==null?'unknown':d.pageCount),d.limitations?.length?'limitations: '+d.limitations.join('; '):'','--- TEXT ---',d.text,'=== DOCUMENT END ==='].filter(Boolean).join('\n')).join('\n\n');
  const approved=caseFields&&Object.keys(caseFields).length?'\n\nAPPROVED ACTIVE-CASE FIELDS (investigator-confirmed; treat as authoritative and note any source conflict):\n'+JSON.stringify(caseFields,null,2):'';
  return `Analyze the supplied case reports for an internal criminal-defense investigator. Use only the supplied source documents and approved active-case fields. Do not invent facts, names, dates, times, contact information, evidence, quotations, page numbers, legal authorities, or citations. If a value is absent, leave it empty. Cite pages only using actual [Page N] markers. Preserve contradictions; never reconcile conflicting times silently. Distinguish facts using exactly these classifications: DIRECT OBSERVATION, REPORTED STATEMENT, ALLEGATION, CORROBORATED FACT, DISPUTED FACT, DOCUMENTED PROCEDURAL ACTION, AI INFERENCE. A report's reference to evidence does not prove production; mark such material REFERENCED, not UPLOADED. Generate: (1) concise chronological statementOfFacts max 20; (2) policeReportBrief with attribution; (3) discoveryReview; (4) preliminary timeline preserving every reported time; (5) investigationStrategy tied to documented gaps/conflicts; (6) parties with role-specific questions; (7) legalQuestions phrased only as attorney-review questions, never conclusions; (8) criticalAlerts; (9) analysisLimitations. Every material fact must carry source.documentId and optional source.page. Return JSON only with keys caseIdentification, sourceDocuments, criticalAlerts, statementOfFacts, policeReportBrief, discoveryReview, timeline, timelineGaps, investigationStrategy, parties, legalQuestions, openInvestigativeQuestions, analysisLimitations.${approved}\n\nSOURCE DOCUMENTS:\n\n${blocks}`;
}
function iaValidate(raw,documents){
  const byId=new Map(documents.map(d=>[d.documentId,d])); const pageMap=new Map(documents.map(d=>[d.documentId,iaPages(d.text)])); const dropped=[];
  function source(v,label){const r=v&&typeof v==='object'?v:{};const id=iaClean(r.documentId,120);const doc=byId.get(id);if(!doc){dropped.push(label+': invalid source document');return null}let page=iaClean(r.page,20);if(page&&!pageMap.get(id).has(page.replace(/[^0-9]/g,''))){dropped.push(label+': unsupported page '+page);page=''}return{documentId:id,documentName:doc.fileName,page}}
  const facts=iaArr(raw.statementOfFacts).slice(0,20).map((x,i)=>{const src=source(x?.source,'fact '+(i+1));if(!src)return null;const c=iaClean(x?.classification,60).toUpperCase();return{sequence:i+1,date:iaClean(x?.date,40),time:iaClean(x?.time,40),fact:iaClean(x?.fact,1200),classification:IA_CLASSIFICATIONS.has(c)?c:'REPORTED STATEMENT',source:src}}).filter(x=>x&&x.fact);
  const timeline=iaArr(raw.timeline).slice(0,200).map((x,i)=>{const src=source(x?.source,'timeline '+(i+1));if(!src)return null;const st=iaClean(x?.status,40).toUpperCase();return{date:iaClean(x?.date,40),time:iaClean(x?.time,40),timeZone:iaClean(x?.timeZone,40),event:iaClean(x?.event,800),persons:iaArr(x?.persons).slice(0,20).map(v=>iaClean(v,200)),location:iaClean(x?.location,300),status:IA_TIMELINE.has(st)?st:'REPORTED',source:src}}).filter(x=>x&&x.event);
  const alerts=iaArr(raw.criticalAlerts).slice(0,30).map((x,i)=>{const src=source(x?.source,'alert '+(i+1));if(!src)return null;return{issue:iaClean(x?.issue,600),whyItMatters:iaClean(x?.whyItMatters,900),requiredFollowUp:iaClean(x?.requiredFollowUp,600),severity:'critical',source:src}}).filter(x=>x&&x.issue);
  const discovery=iaArr(raw.discoveryReview).slice(0,120).map((x,i)=>{const st=iaClean(x?.status,40).toUpperCase();const src=x?.source?.documentId?source(x.source,'discovery '+(i+1)):null;return{item:iaClean(x?.item,400),status:IA_DISCOVERY.has(st)?st:'REQUIRES MANUAL REVIEW',whatItShows:iaClean(x?.whatItShows,600),issue:iaClean(x?.issue,600),followUp:iaClean(x?.followUp,600),source:src}}).filter(x=>x.item);
  const parties=iaArr(raw.parties).slice(0,80).map((x,i)=>{const refs=iaArr(x?.sourceReferences).map((r,n)=>source(r,'party '+(i+1)+' ref '+(n+1))).filter(Boolean);if(!refs.length)return null;return{personId:iaClean(x?.personId,80)||'party_'+(i+1),name:iaClean(x?.name,240),primaryRole:iaClean(x?.primaryRole,120),secondaryRoles:iaArr(x?.secondaryRoles).slice(0,8).map(v=>iaClean(v,120)),nameVariants:iaArr(x?.nameVariants).slice(0,12).map(v=>iaClean(v,240)),phone:iaClean(x?.phone,60),email:iaClean(x?.email,240),address:iaClean(x?.address,400),badgeNumber:iaClean(x?.badgeNumber,60),agency:iaClean(x?.agency,240),keyRelevance:iaClean(x?.keyRelevance,900),interviewStatus:iaClean(x?.interviewStatus,120)||'Not interviewed',recommendedQuestions:iaArr(x?.recommendedQuestions).slice(0,6).map(v=>iaClean(v,500)),sourceReferences:refs,reviewStatus:'AI DRAFT'}}).filter(x=>x&&x.name);
  const legal=iaArr(raw.legalQuestions).slice(0,40).map((x,i)=>({issue:iaClean(x?.issue,500),factsCreatingIssue:iaClean(x?.factsCreatingIssue,1200),standardToResearch:iaClean(x?.standardToResearch,600),missingInformation:iaClean(x?.missingInformation,800),attorneyReviewQuestion:iaClean(x?.attorneyReviewQuestion,800),sources:iaArr(x?.sources).map((r,n)=>source(r,'legal '+(i+1)+' ref '+(n+1))).filter(Boolean)})).filter(x=>x.issue);
  const brief=raw.policeReportBrief&&typeof raw.policeReportBrief==='object'?raw.policeReportBrief:{};
  return{schema:'arc-initial-case-analysis',schemaVersion:1,caseIdentification:{caseName:iaClean(raw.caseIdentification?.caseName,300),defendant:iaClean(raw.caseIdentification?.defendant,240),docketNumber:iaClean(raw.caseIdentification?.docketNumber,120),court:iaClean(raw.caseIdentification?.court,240),agency:iaClean(raw.caseIdentification?.agency,240),incidentNumber:iaClean(raw.caseIdentification?.incidentNumber,120),incidentDate:iaClean(raw.caseIdentification?.incidentDate,60),charges:iaArr(raw.caseIdentification?.charges).slice(0,30).map(v=>iaClean(v,300))},sourceDocuments:documents.map(d=>({documentId:d.documentId,fileName:d.fileName,documentType:d.documentType||'UNCLASSIFIED REPORT',pageCount:d.pageCount,extractionStatus:d.extractionStatus,limitations:iaArr(d.limitations)})),criticalAlerts:alerts,statementOfFacts:facts,policeReportBrief:{summary:iaClean(brief.summary,3000),policeTheory:iaClean(brief.policeTheory,1500),primaryWeakness:iaClean(brief.primaryWeakness,1500)},discoveryReview:discovery,timeline,timelineGaps:iaArr(raw.timelineGaps).slice(0,40).map(v=>iaClean(v,600)).filter(Boolean),investigationStrategy:iaArr(raw.investigationStrategy).slice(0,60).map(x=>({category:iaClean(x?.category,120),action:iaClean(x?.action,800),purpose:iaClean(x?.purpose,800),priority:iaClean(x?.priority,60),sourceOrReason:iaClean(x?.sourceOrReason,800)})).filter(x=>x.action),parties,legalQuestions:legal,openInvestigativeQuestions:iaArr(raw.openInvestigativeQuestions).slice(0,40).map(v=>iaClean(v,600)).filter(Boolean),analysisLimitations:iaArr(raw.analysisLimitations).slice(0,40).map(v=>iaClean(v,600)).filter(Boolean).concat(dropped)};
}
async function ensureInitialAnalysisTable(env){if(!env.DB)return;await env.DB.prepare(`CREATE TABLE IF NOT EXISTS initial_case_analysis(case_id TEXT PRIMARY KEY,payload TEXT NOT NULL,generated_at TEXT NOT NULL,generated_by TEXT NOT NULL,model TEXT DEFAULT '')`).run()}

/* ------------------------------------------------------------------ routes -- */

export async function handleRequest(request, env) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  const rawPath = url.pathname.replace(/\/+$/, '');
  const path = rawPath.replace(/^\/ai\/?/, '').replace(/\/+$/, '');

  try {
    if (path === 'policy' && request.method === 'GET') {
      const table = {};
      Object.keys(TASK_POLICY).forEach(t => { table[t] = TASK_POLICY[t].provider; });
      return json({ policy: table, geminiLadder: GEMINI_LADDER, claudeModel: env.CLAUDE_MODEL || 'claude-sonnet-4-6' }, 200, cors);
    }

    const identity = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion') || '', env);
    const actor = identity.email;

    let user = null;
    if (env.DB) {
      user = await env.DB.prepare('SELECT * FROM legal_users WHERE email=?').bind(actor).first();
      if (!user || user.status !== 'active' || user.role === 'pending') {
        throw Object.assign(new Error('Account pending or disabled. Contact an administrator.'), { status: 403 });
      }
    }

    if (path === 'status' && request.method === 'GET') {
      return json({
        ok: true,
        geminiConfigured: !!env.GOOGLE_API_KEY,
        claudeConfigured: !!env.ANTHROPIC_API_KEY,
        d1: !!env.DB,
        role: user ? user.role : ''
      }, 200, cors);
    }

    /* ---- Compatibility endpoints retained by the integrated ARC UI. ----- */
    if (rawPath === '/api/ai/initial-analysis') {
      const caseId = String(url.searchParams.get('caseId') || '').trim();
      await ensureInitialAnalysisTable(env);
      if (request.method === 'GET') {
        const authorized = await requireCaseAccess(env, user, actor, caseId);
        const row = await env.DB.prepare('SELECT payload FROM initial_case_analysis WHERE case_id=?').bind(authorized).first();
        if (!row) throw Object.assign(new Error('No analysis has been generated for this case.'), { status: 404 });
        return json(JSON.parse(row.payload), 200, cors);
      }
      if (request.method === 'POST') {
        const body = await request.json().catch(()=>null);
        if (!body || typeof body !== 'object') throw Object.assign(new Error('Invalid analysis request.'), { status: 400 });
        const authorized = await requireCaseAccess(env, user, actor, body.caseId || caseId);
        const submitted = iaArr(body.documents).slice(0, IA_MAX_DOCS);
        const documents=[]; let total=0;
        for (const item of submitted) {
          const status=iaClean(item?.extractionStatus,40).toUpperCase(); const raw=String(item?.text||'');
          if(!IA_USABLE.has(status)||raw.trim().length<40)continue;
          const truncated=raw.length>IA_MAX_DOC; const slice=truncated?raw.slice(0,IA_MAX_DOC):raw;
          if(total+slice.length>IA_MAX_TOTAL)break; total+=slice.length;
          documents.push({documentId:iaClean(item?.documentId,120)||'doc_'+(documents.length+1),fileName:iaClean(item?.fileName,240)||'document',documentType:iaClean(item?.documentType,120),pageCount:Number.isFinite(Number(item?.pageCount))?Number(item.pageCount):null,extractionStatus:status,limitations:iaArr(item?.limitations).map(v=>iaClean(v,400)).concat(truncated?['Text was truncated at '+IA_MAX_DOC+' characters for analysis.']:[]),text:slice});
        }
        if(!documents.length)throw Object.assign(new Error('Upload and process the initial case reports before generating the analysis.'),{status:422});
        const caseRow=await env.DB.prepare('SELECT data FROM cases WHERE id=? AND deleted=0').bind(authorized).first();
        const caseData=caseRow?JSON.parse(caseRow.data):{};
        const g=await callGemini(env,{prompt:iaPrompt(documents,caseData.meta||caseData||{}),jsonMode:true,startAt:0});
        let parsed; try{parsed=JSON.parse(String(g.text).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Object.assign(new Error('The analysis service returned unreadable JSON.'),{status:502})}
        const analysis=iaValidate(parsed,documents); analysis.caseId=authorized; analysis.generatedAt=now(); analysis.generatedBy=actor; analysis.model=g.model; analysis.reviewStatus='AI DRAFT'; analysis.sourceDocumentIds=documents.map(d=>d.documentId);
        await env.DB.prepare(`INSERT INTO initial_case_analysis(case_id,payload,generated_at,generated_by,model) VALUES(?,?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET payload=excluded.payload,generated_at=excluded.generated_at,generated_by=excluded.generated_by,model=excluded.model`).bind(authorized,JSON.stringify(analysis),analysis.generatedAt,actor,g.model).run();
        await logProvider(env,{actor,provider:'gemini',task:'case.initial-analysis',caseId:authorized,inChars:total,outChars:g.text.length,ok:true});
        return json(analysis,200,cors);
      }
      throw Object.assign(new Error('Method not allowed.'),{status:405});
    }

    if (rawPath === '/api/ocr/document-ai' && request.method === 'POST') {
      const caseId = await requireCaseAccess(env, user, actor, request.headers.get('X-ARC-Case-ID') || '');
      const body = await request.json().catch(()=>null);
      if(!body||!body.base64)throw Object.assign(new Error('OCR file payload required.'),{status:400});
      const data=String(body.base64); if(data.length>25*1024*1024)throw Object.assign(new Error('OCR payload is too large for one request.'),{status:413});
      const mime=String(body.mimeType||'application/pdf');
      const g=await callGemini(env,{parts:[{inlineData:{mimeType:mime,data}},{text:'Transcribe the document faithfully for legal review. Preserve page order. Return JSON only: {"pages":[{"pageNumber":1,"text":"..."}],"pageCount":1,"text":"full combined text"}. Do not summarize, correct, infer, or invent unreadable text; mark unreadable portions [UNREADABLE].'}],jsonMode:true,startAt:0});
      let o;try{o=JSON.parse(String(g.text).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Object.assign(new Error('OCR response was not valid JSON.'),{status:502})}
      await logProvider(env,{actor,provider:'gemini',task:'document.ocr',caseId,inChars:data.length,outChars:g.text.length,ok:true});
      return json({ocr:{pages:iaArr(o.pages).map((p,i)=>({pageNumber:Number(p.pageNumber)||i+1,text:String(p.text||'')})),pageCount:Number(o.pageCount)||iaArr(o.pages).length,text:String(o.text||'')},model:g.model},200,cors);
    }

    if (rawPath === '/api/gemini-board-command' && request.method === 'POST') {
      const caseId = await requireCaseAccess(env, user, actor, request.headers.get('X-ARC-Case-ID') || '');
      const body=await request.json().catch(()=>null); if(!body)throw Object.assign(new Error('Command payload required.'),{status:400});
      const prompt=`You control only the visual arrangement of an ARC investigation board. Never delete evidence, alter source classifications, change facts, or make legal conclusions. Allowed action types: move, open_view, filter. Return JSON only with {"message":"...","actions":[]}. User command: ${String(body.command||'').slice(0,1000)}\nBoard: ${JSON.stringify(body.board||{}).slice(0,30000)}\nAllowed: ${JSON.stringify(body.allowedActions||[])}`;
      const g=await callGemini(env,{prompt,jsonMode:true,startAt:0});let result;try{result=JSON.parse(String(g.text).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{result={message:g.text,actions:[]}}
      await logProvider(env,{actor,provider:'gemini',task:'board.command',caseId,inChars:prompt.length,outChars:g.text.length,ok:true});
      return json({message:String(result.message||'Command completed.'),actions:Array.isArray(result.actions)?result.actions:[],model:g.model},200,cors);
    }

    /* ---- SDK passthrough -------------------------------------------------
       The OUI/Drug app uses the @google/genai SDK, which builds its own request
       shapes. Rewriting it against /ai/run would mean touching every call site,
       so instead it points its baseUrl here and we inject the key. Access, role,
       model allowlist, and provider logging all still apply. Claude is NOT
       reachable this way: the SDK path is Gemini only, by construction.
       -------------------------------------------------------------------- */
    if (path.startsWith('google/')) {
      const sdkCaseId = await requireCaseAccess(env, user, actor, request.headers.get('X-ARC-Case-ID') || '');
      const upstreamPath = path.slice('google/'.length);
      const model = (upstreamPath.match(/models\/([^:/?]+)/) || [])[1] || '';
      const sdkModels = [...GEMINI_LADDER, env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'];
      if (model && !sdkModels.includes(model)) {
        throw Object.assign(
          new Error('Model "' + model + '" is not approved by the ARC gateway. Allowed: ' + sdkModels.join(', ')),
          { status: 400 }
        );
      }

      const len = Number(request.headers.get('content-length') || 0);
      if (len > MAX_BODY) throw Object.assign(new Error('Gateway control request too large'), { status: 413 });
      const hasBody = !['GET', 'HEAD', 'DELETE'].includes(request.method);
      const bodyBytes = hasBody ? await request.arrayBuffer() : null;
      if (bodyBytes && bodyBytes.byteLength > MAX_BODY) {
        throw Object.assign(new Error('Gateway control request too large'), { status: 413 });
      }

      const headers = { 'x-goog-api-key': env.GOOGLE_API_KEY };
      const contentType = request.headers.get('content-type');
      if (contentType) headers['content-type'] = contentType;
      for (const name of [
        'x-goog-upload-protocol', 'x-goog-upload-command',
        'x-goog-upload-header-content-length', 'x-goog-upload-header-content-type',
        'x-goog-upload-offset'
      ]) {
        const value = request.headers.get(name);
        if (value) headers[name] = value;
      }

      const upstream = await fetch(
        'https://generativelanguage.googleapis.com/' + upstreamPath + url.search,
        { method: request.method, headers, body: bodyBytes && bodyBytes.byteLength ? bodyBytes : undefined }
      );
      const out = await upstream.text();
      await logProvider(env, {
        actor, provider: 'gemini', task: 'sdk:' + (model || upstreamPath).slice(0, 60),
        caseId: sdkCaseId,
        inChars: bodyBytes ? bodyBytes.byteLength : 0, outChars: out.length, ok: upstream.ok,
      });
      const responseHeaders = {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        ...cors,
      };
      const uploadUrl = upstream.headers.get('x-goog-upload-url');
      if (uploadUrl) {
        responseHeaders['x-goog-upload-url'] = uploadUrl;
        responseHeaders['Access-Control-Expose-Headers'] = 'X-Goog-Upload-URL';
      }
      return new Response(out, { status: upstream.status, headers: responseHeaders });
    }

    if (path !== 'run' || request.method !== 'POST') {
      throw Object.assign(new Error('Unknown AI route.'), { status: 404 });
    }

    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY) throw Object.assign(new Error('Request body too large'), { status: 413 });

    let body;
    try { body = await request.json(); }
    catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }

    const task = String(body.task || '').trim();
    const rule = TASK_POLICY[task];
    if (!rule) {
      throw Object.assign(new Error('Unknown task "' + task + '". Add it to the routing policy before a module can call it.'), { status: 400 });
    }
    if (rule.roles && user && !rule.roles.includes(user.role)) {
      throw Object.assign(new Error('Your role may not run ' + task + '.'), { status: 403 });
    }

    /* A module cannot override the provider. This is the whole point of the
       gateway, so an attempt is refused rather than quietly ignored. */
    if (body.provider && body.provider !== rule.provider) {
      throw Object.assign(new Error('Provider is set by task, not by the caller. ' + task + ' runs on ' + rule.provider + '.'), { status: 400 });
    }
    if (body.model) {
      throw Object.assign(new Error('Model IDs are set by the gateway. Send a task, not a model.'), { status: 400 });
    }

    const p = body.payload || {};
    const inChars = JSON.stringify(p).length;
    const caseId = await requireCaseAccess(env, user, actor, body.caseId || p.caseId || '');

    let out, model;
    try {
      if (rule.provider === 'claude') {
        out = await callClaude(env, p);
        model = env.CLAUDE_MODEL || 'claude-sonnet-4-6';
      } else {
        const g = await callGemini(env, Object.assign({}, p, { startAt: GEMINI_ROLES[rule.model] || 0 }));
        out = g.text;
        model = g.model;
      }
    } catch (e) {
      await logProvider(env, { actor, provider: rule.provider, task, caseId, inChars, outChars: 0, ok: false });
      throw e;
    }

    await logProvider(env, { actor, provider: rule.provider, task, caseId, inChars, outChars: out.length, ok: true });
    return json({ task, provider: rule.provider, model, text: out }, 200, cors);

  } catch (e) {
    return json({ error: e.message || 'AI gateway error' }, e.status || 500, cors);
  }
}

export default { fetch: handleRequest };
