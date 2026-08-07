// One-time parser: motion_bank.txt -> knowledge/motion_bank.json
import fs from 'fs';
const raw = fs.readFileSync('/home/claude/motion_bank.txt','utf8');
const lines = raw.split('\n');
const entries = [];
let cur = null, mode = null;
const headRe = /^([IVXLC]+)\.(\d+)\s+-\s+(.+?)\s*$/;
for (let line of lines) {
  const t = line.trim();
  if (/^Page \d+$/.test(t)) continue;
  const h = t.match(headRe);
  if (h) {
    if (cur) entries.push(cur);
    cur = { section: h[1], id: parseInt(h[2],10), title: h[3].trim(), authority: '', theory: '' };
    mode = null; continue;
  }
  if (!cur) continue;
  if (/^Motion Name\b/.test(t)) { mode='name'; continue; }
  if (/^Supporting Case Law \/ Authority\b/.test(t)) {
    mode='auth';
    cur.authority += t.replace(/^Supporting Case Law \/ Authority\s*/,'') + ' ';
    continue;
  }
  if (/^How Used in Attached File\b/.test(t)) {
    mode='how';
    cur.theory += t.replace(/^How Used in Attached File\s*/,'') + ' ';
    continue;
  }
  if (!t) continue;
  if (mode==='auth') cur.authority += t+' ';
  else if (mode==='how') cur.theory += t+' ';
}
if (cur) entries.push(cur);
for (const e of entries) {
  e.authority = e.authority.replace(/\s+/g,' ').trim();
  e.theory = e.theory.replace(/\s+/g,' ').trim()
    .replace(/^In the attached motion bank, this authority is used to support the following motion theory:\s*/,'');
  // split relief out
  const m = e.theory.match(/The requested relief is (.+?)\.?$/);
  e.relief = m ? m[1].trim().replace(/\.$/,'') : '';
  e.theory = e.theory.replace(/\s*The requested relief is .+$/,'').trim();
  // authorities array
  e.authorities = e.authority.split(/;\s*/).map(s=>s.trim().replace(/\.$/,'')).filter(Boolean);
  delete e.authority;
}
// category by section roman numeral -> label
const cats = {I:'Discovery & Preservation',II:'Search & Seizure',III:'Identification',IV:'Statements',V:'Digital Evidence',VI:'Prejudice / In Limine',VII:'Funds',VIII:'OUI / Breath Test',IX:'Dismissal & Particulars',X:'Evidence / Medical',XI:'Informants & Witness Records',XII:'Domestic / 209A',XIII:'Drug Certificates',XIV:'Larceny / Value',XV:'Motor Vehicle',XVI:'Police Records & Media',XVII:'Expert & Services Funds',XVIII:'Suppression (Advanced)',XIX:'Dismissal (PC / Rule 36)',XX:'Severance',XXI:'Giglio & Rule 14',XXII:'Instructions & In Limine',XXIII:'Funds (Ex Parte)',XXIV:'Venue & Voluntariness',XXV:'Digital Forensics & Grand Jury',XXVI:'Discovery (Expanded)',XXVII:'Rule 17 & Demands',XXVIII:'Trial & Post-Trial',XXIX:'Bail & Pretrial',XXX:'Charging Defects',XXXI:'Appeals',XXXII:'Post-Conviction',XXXIII:'Habeas & Probation',XXXIV:'Jury & Recordation',XXXV:'Grand Jury Integrity',XXXVI:'Informant Disclosure',XXXVII:'Search Warrant Practice'};
for (const e of entries) e.category = cats[e.section] || e.section;
fs.mkdirSync('knowledge',{recursive:true});
fs.writeFileSync('knowledge/motion_bank.json', JSON.stringify({source:'ARC_Motion_Bank_Case_Law_How_Used.pdf',count:entries.length,entries},null,1));
console.log('entries:',entries.length);
console.log(JSON.stringify(entries[0],null,1));
console.log(JSON.stringify(entries[entries.length-1],null,1));
