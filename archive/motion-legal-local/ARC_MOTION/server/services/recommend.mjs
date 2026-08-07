// Rule-based motion recommendation engine.
// Deterministic. Uses only facts entered by counsel plus the verified motion bank.
// Never invents facts. Classifies: Draft Now | Needs More Facts | Not Supported Yet.
import fs from 'fs';
import path from 'path';
import { ROOT } from '../db.mjs';

const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'knowledge', 'motion_bank.json'), 'utf8'));
export const MOTION_BANK = bank.entries;
const byTitle = new Map(MOTION_BANK.map(e => [e.title.toLowerCase(), e]));

function find(title) { return byTitle.get(title.toLowerCase()) || null; }

// Fact-category -> triggered motion titles from the bank.
const TRIGGERS = [
  { cats: ['stop'], motions: ['Motion to Suppress Stop', 'Motion to Challenge Probable Cause'] },
  { cats: ['frisk'], motions: ['Motion to Suppress Frisk'] },
  { cats: ['search'], motions: ['Motion to Suppress Search', 'Motion to Suppress Evidence Seized Pursuant to Search Warrant'] },
  { cats: ['seizure'], motions: ['Motion to Suppress Seizure'] },
  { cats: ['warrant'], motions: ['Motion to Suppress Warrant Evidence', 'Motion for Franks/Amral Hearing', 'Motion to Suppress for Lack of Nexus in Search Warrant', 'Motion for Search Warrant Return, Inventory, and Execution Records'] },
  { cats: ['probable cause'], motions: ['Motion to Challenge Probable Cause', 'Motion to Dismiss for Lack of Probable Cause'] },
  { cats: ['statement', 'miranda'], motions: ['Motion to Suppress Statements - Miranda', 'Motion to Suppress Booking Statements'] },
  { cats: ['voluntariness'], motions: ['Motion to Suppress Involuntary Statements', 'Motion for Humane Practice Hearing', 'Motion for DiGiambattista Instruction'] },
  { cats: ['identification'], motions: ['Motion to Suppress Out-of-Court Identification', 'Motion to Preclude In-Court Identification', 'Motion to Exclude Suggestive Identification Evidence'] },
  { cats: ['digital evidence', 'phone evidence'], motions: ['Motion to Suppress Cell Phone Search', 'Motion to Exclude Cell Phone Attribution Evidence', 'Motion to Preserve and Produce Cellebrite Extraction Data'] },
  { cats: ['social media'], motions: ['Motion to Exclude Social Media Evidence', 'Motion to Exclude Unauthenticated Screenshots'] },
  { cats: ['location data'], motions: ['Motion to Suppress CSLI, GPS, and Location Data', 'Motion to Exclude Location Data / Digital Tracking'] },
  { cats: ['authentication'], motions: ['Motion to Exclude Unauthenticated Screenshots', 'Motion to Exclude Statements Lacking Context or Attribution'] },
  { cats: ['chain of custody'], motions: ['Motion to Inspect Tangible Evidence'] },
  { cats: ['brady', 'impeachment'], motions: ['Motion for Brady and Impeachment Material', 'Motion for Disclosure of Giglio Material', 'Motion for Disclosure of Police Witness Disciplinary, Credibility, and Impeachment Material'] },
  { cats: ['missing discovery'], motions: ['Motion to Compel Discovery', 'Motion to Compel Rule 14 Discovery', 'Motion for Additional Discovery', 'Motion for Sanctions for Discovery Noncompliance'] },
  { cats: ['prior bad acts'], motions: ['Motion in Limine to Exclude Prior Bad Acts', 'Motion in Limine to Exclude Uncharged Misconduct and Propensity Evidence'] },
  { cats: ['immigration reference'], motions: ['Motion to Exclude Immigration Status'] },
  { cats: ['gang reference'], motions: ['Motion to Exclude Gang References', 'Motion to Exclude Gang Affiliation Evidence'] },
  { cats: ['firearm reference'], motions: ['Motion to Exclude Firearm References Not Tied to Charged Conduct'] },
  { cats: ['witness credibility'], motions: ['Motion to Be Furnished with Witness Criminal Records', 'Motion for Disclosure of Witness Lists, Witness Statements, and Witness Criminal Records'] },
  { cats: ['interpreter'], motions: ['Ex Parte Motion for Funds to Retain Interpreter and Translation Services with Incorporated Affidavit'] },
  { cats: ['medical'], motions: ['Motion for Medical Records', 'Motion to Preclude Lay Medical Opinion by Police Witnesses'] },
  { cats: ['mental health'], motions: ['Motion for Funds to Secure the Services of an Independent Psychiatrist/Psychologist with Incorporated Affidavit'] },
  { cats: ['expert issue'], motions: ['Ex Parte Motion for Additional Expert Funds'] },
  { cats: ['alibi'], motions: ['Notice of Alibi'] },
];

// Baseline discovery motions recommended for every active case.
const BASELINE = ['Motion to Compel Discovery', 'Motion to Preserve Evidence', 'Motion for Brady and Impeachment Material',
  'Motion for Production and Preservation of CAD Logs, 911 Calls, Dispatch Audio, Radio Transmissions, BWC Footage, CMC Footage, and Incident Chronology'];

export function recommend(caseRow, facts) {
  const recs = new Map();
  const push = (title, basisFacts, reason) => {
    const bankEntry = find(title);
    if (!bankEntry) return;
    const key = bankEntry.title;
    const verified = basisFacts.filter(f => f.verification === 'verified');
    let status;
    if (reason === 'baseline') status = 'Draft Now';
    else if (verified.length) status = 'Draft Now';
    else if (basisFacts.length) status = 'Needs More Facts';
    else status = 'Not Supported Yet';
    const existing = recs.get(key);
    if (existing) {
      const rank = { 'Draft Now': 3, 'Needs More Facts': 2, 'Not Supported Yet': 1 };
      if (rank[status] > rank[existing.status]) existing.status = status;
      existing.facts.push(...basisFacts);
      return;
    }
    recs.set(key, { bank: bankEntry, status, facts: basisFacts.slice(), reason });
  };

  for (const t of BASELINE) push(t, [], 'baseline');
  for (const trig of TRIGGERS) {
    const matched = facts.filter(f => trig.cats.includes((f.category || '').toLowerCase()));
    if (!matched.length) continue;
    for (const title of trig.motions) push(title, matched, 'fact-category');
  }

  return [...recs.values()].map(r => {
    const seen = new Set();
    const basis = r.facts.filter(f => !seen.has(f.id) && seen.add(f.id));
    const unverified = basis.filter(f => f.verification !== 'verified');
    return {
      bank_id: r.bank.id,
      title: r.bank.title,
      category: r.bank.category,
      status: r.status,
      factual_basis: basis.map(f => `- ${f.statement}${f.verification !== 'verified' ? ' [UNVERIFIED]' : ''}${f.page ? ` (p. ${f.page})` : ''}`).join('\n')
        || (r.reason === 'baseline' ? 'Baseline discovery and preservation practice; applies to every open case.' : ''),
      missing_facts: r.status === 'Needs More Facts'
        ? `Verify before drafting: ${unverified.map(f => f.statement).join('; ').slice(0, 500)}`
        : (r.status === 'Not Supported Yet' ? 'No supporting facts of this category are in the record yet.' : ''),
      legal_issues: r.bank.theory,
      potential_authorities: r.bank.authorities.join('; '),
      requested_relief: r.bank.relief,
      risks: 'Confirm every factual assertion and check every authority for amendment or supersession before filing.',
      confidence: 'rule-based',
    };
  }).sort((a, b) => {
    const rank = { 'Draft Now': 0, 'Needs More Facts': 1, 'Not Supported Yet': 2 };
    return rank[a.status] - rank[b.status] || a.title.localeCompare(b.title);
  });
}
