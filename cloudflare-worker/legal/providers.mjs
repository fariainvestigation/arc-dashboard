// Claude drafting gateway. Key lives in the Worker secret ANTHROPIC_API_KEY only.
// CourtListener lives in arc_courtlistener_client.mjs.
import { now, uuid } from './lib.mjs';
import { logProvider } from './arc_courtlistener_client.mjs';

// Statuses an authority must reach before Claude may cite it. Imported/Located/
// Pinpoint Needed/Superseded/Do Not Use are never available to the drafter.
export const USABLE_STATUSES = ['Verified', 'Persuasive', 'Controlling'];

// ---- Claude drafting gateway ------------------------------------------------
const DRAFT_SYSTEM = `You are the drafting assistant inside ARC, a Massachusetts criminal defense platform.
You draft FROM THE DEFENSE PERSPECTIVE and refer to the prosecution as "the Commonwealth."
STRICT SOURCE HIERARCHY - you may use ONLY:
1. The approved ARC case facts provided (each has a fact ID; cite it in brackets like [FACT:id]).
2. The approved ARC findings provided. Treat each selected finding as source material and cite it with its [FACT:id] tag.
3. The verified authorities provided (cite ONLY these; use the exact citation strings given, with [AUTH:id]).
4. The motion template structure provided.
5. The attorney instructions provided.
ABSOLUTE PROHIBITIONS: never invent facts, citations, or quotations; never change docket numbers or party
names; never treat allegations as established facts; never present unverified authority as controlling;
never include material about any other client or case. Where information is missing, write a visible
placeholder such as [FACTUAL SUPPORT REQUIRED] or [AUTHORITY REQUIRES VERIFICATION].
Describe an authority as controlling ONLY when its weight is marked Controlling. Authorities marked
Persuasive must be presented as persuasive. Never rely on a concurrence or dissent as the holding of
the court; identify the opinion type when you cite one.
Your output is a DRAFT PROPOSAL for attorney review, never a final filing.`;

function citationRegexes() {
  return [
    /\b\d{1,4}\s+(?:Mass\.(?:\s+App\.\s+Ct\.)?|U\.S\.|S\.\s?Ct\.|F\.(?:2d|3d|4th)?|F\.\s?Supp\.(?:\s?2d|\s?3d)?|N\.E\.(?:2d|3d)?)\s+\d{1,5}\b/g,
    /\b(?:M\.G\.L\.|G\.L\.|Mass\. Gen\. Laws)\s*c\.?\s*\d+[A-Za-z]*\s*(?:,?\s*[§\u00a7]\s*[0-9A-Za-z().-]+)?/gi,
    /\b\d{2,4}\s+CMR\s+\d+(?:\.\d+)*(?:\([A-Za-z0-9]+\))*/gi,
    /\bMass\. R\. Crim\. P\.\s*\d+(?:\([a-z0-9]+\))*/gi,
    /\bMass\. G\. Evid\.\s*[§\u00a7]\s*\d+(?:\([a-z0-9]+\))*/gi,
  ];
}
/** Reject drafts containing case citations that are not in the verified authority set. */
export function findFabricatedCitations(draftText, verifiedAuthorities) {
  const allowed = verifiedAuthorities.map(a => `${a.case_name} ${a.citation}`).join(' || ');
  const found = new Set();
  for (const re of citationRegexes()) {
    for (const m of String(draftText).matchAll(re)) {
      const cite = m[0].replace(/\s+/g, ' ').trim();
      if (!allowed.includes(cite)) found.add(cite);
    }
  }
  return [...found];
}

async function callClaude(env, system, prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 8000, system, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'Claude request failed'), { status: 502 });
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}

/**
 * Assemble the drafting context from the master motion record + approved sources.
 * facts/findings arrive from the frontend as the APPROVED ARC records the user selected
 * (each with its ARC source ID); authorities are re-read from D1 and filtered to Verified.
 */
export async function buildDraftContext(env, motion, body) {
  const ids = JSON.parse(motion.selected_authority_ids || '[]');
  const verified = [];
  for (const id of ids) {
    const a = await env.DB.prepare('SELECT * FROM authorities WHERE id=? AND case_id=?').bind(id, motion.case_id).first();
    if (a && USABLE_STATUSES.includes(a.verification_status)) verified.push(a);
  }
  const facts = (body.approvedFacts || []).filter(f => f && f.id && f.text);
  const findings = (body.approvedFindings || []).filter(f => f && f.id && f.text);
  return { verified, facts, findings, instructions: String(body.attorneyInstructions || '').slice(0, 4000) };
}

export async function draftMotion(env, actor, motion, body) {
  const ctx = await buildDraftContext(env, motion, body);
  if (!ctx.facts.length) throw Object.assign(new Error('No approved facts selected. Select approved ARC facts before drafting.'), { status: 400 });
  const caseInfo = body.caseInfo || {};
  const prompt = `CASE (use exactly; never alter): client ${caseInfo.client || '[CLIENT NAME]'}; docket ${caseInfo.docket || '[DOCKET NUMBER]'}; court ${caseInfo.court || '[COURT]'}; county ${caseInfo.county || '[COUNTY]'}.
MOTION: ${motion.title}

APPROVED ARC FACTS (the only permissible facts; keep [FACT:id] tags):
${ctx.facts.map(f => `[FACT:${f.id}] (${f.source || 'source on file'}${f.page ? ', p. ' + f.page : ''}) ${f.text}`).join('\n')}

APPROVED FINDINGS:
${ctx.findings.map(f => `[FACT:${f.id}] ${f.text}`).join('\n') || '(none selected)'}

VERIFIED AUTHORITIES (the only permissible citations; use exact strings, keep [AUTH:id] tags):
${ctx.verified.map(a => `[AUTH:${a.id}] ${a.case_name}, ${a.citation}${a.pinpoint ? ', at ' + a.pinpoint : ''} (${a.court}${a.decided_date ? ' ' + a.decided_date.slice(0, 4) : ''})${a.opinion_type && a.opinion_type !== 'lead' && a.opinion_type !== 'majority' ? ' [' + a.opinion_type.toUpperCase() + ' OPINION - not the holding of the court]' : ''} - weight: ${a.verification_status}${a.quoted_language ? ' - verified quote: "' + a.quoted_language.slice(0, 300) + '"' : ''}`).join('\n') || '(none - use [AUTHORITY REQUIRES VERIFICATION] placeholders instead of citing anything)'}

SECTION OUTLINE TO FILL:
${JSON.parse(motion.sections || '[]').map(s => `- ${s.heading || s.type}`).join('\n')}

ATTORNEY INSTRUCTIONS: ${ctx.instructions || '(none)'}

Draft the motion sections. Return plain text with each section as "### HEADING" followed by the body.`;
  const draft = await callClaude(env, DRAFT_SYSTEM, prompt);
  await logProvider(env, actor, 'anthropic', 'draft-motion', motion.case_id, prompt.length, draft.length, true);
  const fabricated = findFabricatedCitations(draft, ctx.verified);
  if (fabricated.length) {
    await env.DB.prepare(`INSERT INTO legal_audit (id, at, actor, action, case_id, record_type, record_id, summary)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(uuid(), now(), actor, 'claude.fabrication_rejected', motion.case_id, 'motion', motion.id, fabricated.join('; ').slice(0, 400)).run();
    throw Object.assign(new Error('Draft rejected: it contained citations outside the verified authority set (' + fabricated.join('; ') + '). Nothing was saved.'), { status: 422, fabricated });
  }
  // parse "### HEADING" blocks back into sections
  const parts = draft.split(/^###\s+/m).filter(Boolean).map(chunk => {
    const nl = chunk.indexOf('\n');
    return { heading: chunk.slice(0, nl).trim(), body: chunk.slice(nl + 1).trim() };
  });
  return { proposal: true, note: 'DRAFT PROPOSAL: attorney review required before any use.', sections: parts, raw: draft };
}

export async function reviseSection(env, actor, motion, body) {
  const ctx = await buildDraftContext(env, motion, body);
  const section = body.section || {};
  const prompt = `Revise ONE section of "${motion.title}" per the attorney instruction, under the same source restrictions.
SECTION HEADING: ${section.heading}
CURRENT TEXT:\n${section.body}\n
APPROVED FACTS:\n${ctx.facts.map(f => `[FACT:${f.id}] ${f.text}`).join('\n')}
VERIFIED AUTHORITIES:\n${ctx.verified.map(a => `[AUTH:${a.id}] ${a.case_name}, ${a.citation}`).join('\n') || '(none)'}
ATTORNEY INSTRUCTION: ${ctx.instructions || body.instruction || ''}
Return only the revised section body as plain text.`;
  const out = await callClaude(env, DRAFT_SYSTEM, prompt);
  await logProvider(env, actor, 'anthropic', 'revise-section', motion.case_id, prompt.length, out.length, true);
  const fabricated = findFabricatedCitations(out, ctx.verified);
  if (fabricated.length) throw Object.assign(new Error('Revision rejected: fabricated citations (' + fabricated.join('; ') + ')'), { status: 422 });
  return { proposal: true, body: out.trim() };
}

export async function verifyDraft(env, actor, motion, body) {
  // Deterministic verification, no AI required: every citation in the sections must map to a stored authority.
  const sections = JSON.parse(motion.sections || '[]');
  const text = sections.map(s => `${s.heading}\n${s.body}`).join('\n');
  const ids = JSON.parse(motion.selected_authority_ids || '[]');
  const auths = [];
  for (const id of ids) {
    const a = await env.DB.prepare('SELECT * FROM authorities WHERE id=? AND case_id=?').bind(id, motion.case_id).first();
    if (a) auths.push(a);
  }
  const usable = auths.filter(a => USABLE_STATUSES.includes(a.verification_status));
  const fabricated = findFabricatedCitations(text, usable);
  const unverifiedUsed = auths.filter(a => !USABLE_STATUSES.includes(a.verification_status) && text.includes(`[AUTH:${a.id}]`)).map(a => `${a.case_name} (${a.verification_status})`);
  const missingPinpoint = usable.filter(a => !a.pinpoint && text.includes(`[AUTH:${a.id}]`)).map(a => a.case_name);
  const supersededUsed = auths.filter(a => ['Superseded', 'Do Not Use'].includes(a.verification_status) && text.includes(`[AUTH:${a.id}]`)).map(a => `${a.case_name} (${a.verification_status})`);
  const wrongJurisdiction = usable.filter(a => text.includes(`[AUTH:${a.id}]`) && a.verification_status === 'Controlling' && !/^(mass|scotus)/i.test(String(a.cl_court_id || '')) ).map(a => a.case_name);
  const unsupportedParagraphs = sections
    .filter(s => ['facts', 'argument', 'irac'].includes(s.type))
    .flatMap(s => String(s.body).split(/\n{2,}/).filter(p => p.trim().length > 80 && !/\[FACT:/.test(p) && !/\[(FACTUAL SUPPORT REQUIRED|AUTHORITY REQUIRES VERIFICATION)/.test(p)))
    .map(p => p.slice(0, 120));
  return { fabricated, unverifiedUsed, missingPinpoint, supersededUsed, wrongJurisdiction, unsupportedParagraphs };
}
