import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const expected = {
  team: 'old-lake-2c90.cloudflareaccess.com',
  aud: '165b93a400b3aa4c67a33441298df65793a1b50886a070d5087e59ec0732b212',
  d1: '6c04c557-f8de-4590-a235-76fa117ff6d8',
  dbName: 'arc_legal',
  r2: 'arc-legal-files',
  origins: ['https://arcdefensereport.com','https://www.arcdefensereport.com']
};

function read(rel){ return fs.readFileSync(path.join(root,rel),'utf8'); }
function must(condition,msg){ if(!condition) failures.push(msg); }
function checkToml(rel, needsR2=false){
  const txt = read(rel);
  must(txt.includes(expected.team), `${rel}: wrong/missing Access team domain`);
  must(txt.includes(expected.aud), `${rel}: wrong/missing Access AUD`);
  must(txt.includes(expected.d1), `${rel}: wrong/missing D1 database id`);
  must(txt.includes(`database_name = "${expected.dbName}"`), `${rel}: wrong/missing D1 database name`);
  for(const origin of expected.origins) must(txt.includes(origin), `${rel}: allowed origin missing ${origin}`);
  if(needsR2) must(txt.includes(`bucket_name = "${expected.r2}"`), `${rel}: R2 bucket binding missing ${expected.r2}`);
  must(!/(REPLACE_WITH|PASTE_YOUR|your-team\.cloudflareaccess\.com|YOUR_D1|YOUR_R2|your-domain)/i.test(txt), `${rel}: unresolved production placeholder`);
  return txt;
}

const sync = checkToml('arc-sync-backend/wrangler.toml', true);
const ai = checkToml('cloudflare-worker/ai/wrangler.toml');
const legal = checkToml('cloudflare-worker/legal/wrangler.toml', true);
const research = checkToml('cloudflare-worker/research/wrangler.toml');
for (const route of ['/sync/*','/api/cases','/api/health','/api/audit-log','/api/report-approvals','/api/report-assets']) must(sync.includes(route), `sync Worker route missing ${route}`);
must(!sync.includes('pattern = \"arcdefensereport.com/api/*\"'), 'sync Worker must not own the broad /api/* route');
for (const route of ['/ai/*','/api/ai/initial-analysis','/api/ocr/document-ai','/api/gemini-board-command']) must(ai.includes(route), `AI Worker route missing ${route}`);
must(legal.includes('/legal-api/*'), 'Legal Worker route missing /legal-api/*');
must(research.includes('/research-api/*'), 'Research Worker route missing /research-api/*');

must(!fs.existsSync(path.join(root,'vercel.json')), 'legacy vercel.json remains in production root');
must(!fs.existsSync(path.join(root,'api')), 'legacy api/ directory remains in production root');
must(!fs.existsSync(path.join(root,'01_Report_Generator.html')), 'legacy 01_Report_Generator.html remains in production root');

const activeRoots = [
  'index.html','01_Case_Dashboard.html','22_Report_Package_Builder.html','19_Final_Client_Report.html',
  '23_Motion_and_Legal.html','24_Public_Web_Research.html','arc_backend.js','arc_unified_bridge.js',
  'arc_ai_client.js','arc_provider_client.js','arc_gemini_client.js'
];
for(const rel of activeRoots){
  if(!fs.existsSync(path.join(root,rel))) failures.push(`missing active production file ${rel}`);
}

const oui = read('oui-drug/index.html');
must(oui.includes('/sync/module-state'), 'OUI/Drug wrapper is not persisted to shared D1 module state');
must(oui.includes('expectedRev: remoteRev') && oui.includes('If-Match'), 'OUI/Drug shared state is missing optimistic revision protection');
must(oui.includes('X-ARC-Case-ID'), 'OUI/Drug Gemini gateway calls do not carry the authoritative active case id');
must(oui.includes('Cases are created and deleted only from the ARC Case Dashboard.'), 'OUI/Drug standalone case creation/deletion interlock is missing');

const peopleBridge = read('people/assets/arc_people_bridge.js');
const peopleStore = read('people/assets/store.js');
must(peopleBridge.includes('/sync/module-state') && peopleBridge.includes('module=${MODULE_ID}'), 'People module is not persisted through shared D1 module state');
must(peopleBridge.includes('If-Match') && peopleBridge.includes('expectedRev'), 'People module shared state is missing optimistic revision protection');
for (const method of ['updateExtraction','approveExtraction','rejectExtraction','mergeExtraction','resetPrototype']) {
  must(peopleStore.includes(`bridgeCall("${method}"`), `People store mutator does not use production bridge: ${method}`);
}
for (const rel of ['people/index.html','people/add-person.html','people/profile.html','people/review.html']) {
  must(read(rel).includes('assets/arc_people_bridge.js'), `${rel}: production People bridge is not loaded`);
}

// Provider secrets must not be embedded in active source. Check for plausible live-key patterns, not secret variable names.
const liveKeyPatterns = [
  /AIza[0-9A-Za-z_-]{25,}/g,
  /sk-ant-[0-9A-Za-z_-]{20,}/g,
  /fc-[0-9A-Za-z_-]{20,}/g,
  /(?:Token|Bearer)\s+[0-9A-Za-z_-]{32,}/g
];
function walk(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(['archive','.git','node_modules','DEPLOY_PAGES'].includes(ent.name)) continue;
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(p,out); else out.push(p);
  }
  return out;
}
for(const file of walk(root)){
  if(!/\.(?:html|js|mjs|json|toml|css|md|txt)$/i.test(file)) continue;
  const text=fs.readFileSync(file,'utf8');
  for(const pattern of liveKeyPatterns){
    pattern.lastIndex=0;
    if(pattern.test(text)) failures.push(`${path.relative(root,file)}: possible live provider secret pattern`);
  }
}

if(failures.length){
  failures.forEach(x=>console.error('FAIL:',x));
  console.error(`Production config check failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('Production config check passed: Cloudflare-only bindings/routes, real Access/D1 values, no active Vercel path, no live key patterns.');
