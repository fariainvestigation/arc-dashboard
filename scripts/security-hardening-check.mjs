import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
const must=(c,m)=>{if(!c)failures.push(m)};
const h=read('DEPLOY_PAGES/_headers');
must(/Strict-Transport-Security:\s*max-age=31536000/.test(h),'HSTS missing');
must(/Content-Security-Policy:/.test(h),'CSP missing');
const globalBlock=(h.match(/^\/\*\n([\s\S]*?)(?=\n\n\/)/m)||[])[1]||'';
must(!/Cache-Control:/i.test(globalBlock),'global /* must not set Cache-Control; it conflicts with asset cache rules');
must(/\/\*\.html[\s\S]*Cache-Control:\s*no-store/.test(h),'HTML no-store rule missing');
must(/\/assets\/\*[\s\S]*Cache-Control:\s*public, max-age=86400/.test(h),'asset cache rule missing');
must(/\/libs\/\*[\s\S]*Cache-Control:\s*public, max-age=86400/.test(h),'library cache rule missing');

for(const f of ['arc-notebook.html','04_Discovery_Review.html','05_Chain_of_Custody_Analyzer.html','24_Public_Web_Research.html','02_Legal_Research.html','19_Final_Client_Report.html']){
 const t=read(f); must(t.includes('libs/purify.min.js'),`${f}: DOMPurify not loaded`); must(t.includes('arc_security.js'),`${f}: ARC sanitizer helper not loaded`);
}
const sec=read('arc_security.js');
must(sec.includes('DOMPurify')&&sec.includes('ARC.safeHtml')&&sec.includes('ARC.safeSvg'),'shared sanitizer helper incomplete');

const canonical='cloudflare-worker/legal/'; const mirror='modules/motion-legal-integrated/worker/';
for(const f of ['legal_worker.mjs','providers.mjs','arc_courtlistener_client.mjs','arc_motion_render.mjs','lib.mjs','schema.sql']){
 must(read(canonical+f)===read(mirror+f),`legal worker mirror drift: ${f}`);
}
const legalTest=read('modules/motion-legal-integrated/tests/legal.test.mjs');
must(legalTest.includes("../../../cloudflare-worker/legal/legal_worker.mjs"),'legal tests are not targeting canonical deployed worker');

const ai=read('cloudflare-worker/ai/arc_ai_gateway.mjs');
const research=read('cloudflare-worker/research/research_worker.mjs');
must(ai.includes("Origin not allowed")&&ai.indexOf("Origin not allowed")<ai.indexOf("verifyAccessJwt",ai.indexOf('export async function handleRequest')),'AI origin rejection is not early');
must(research.includes("Origin not allowed")&&research.indexOf("Origin not allowed")<research.indexOf('user(request,env)',research.indexOf('export async function handle')),'research origin rejection is not early');
const sync=read('arc-sync-backend/worker.js');
must(sync.includes('Origin not allowed')&&sync.indexOf('Origin not allowed')<sync.indexOf('await identity(request, env)'),'sync origin rejection is not early');
must(research.includes('0.0.0.0')&&research.includes('ffff')&&research.includes('privateIpv4Parts'),'research SSRF private-address coverage incomplete');
must(read('arc_unified_bridge.js').includes('caseSyncPromises.get(caseId)')&&read('arc_unified_bridge.js').includes('latestLocal'),'case sync serialization / ACK merge incomplete');
must(read('arc_unified_bridge.js').includes('rebaseCaseOnConflict')&&read('arc_unified_bridge.js').includes('Choose Server Version or Your Version'),'409 rebase / field-conflict handling incomplete');
must(read('arc_unified_bridge.js').includes('hasUnresolvedCaseConflicts')&&read('arc_unified_bridge.js').includes('sync-conflicts-resolved'),'unresolved sync conflict gate incomplete');
must(read('workspace.html').includes('saveCaseAsync')&&read('case.html').includes('saveCaseAsync'),'workspace/case pages must await authoritative case saves');
must(read('workspace.html').includes('Saving…')&&read('case.html').includes('Saving…'),'save status must show Saving before D1 confirms');

if(failures.length){for(const f of failures)console.error('FAIL:',f);process.exit(1)}
console.log('Security hardening check passed: cache policy, CSP/HSTS, DOMPurify wiring, canonical legal tests, and early origin rejection.');
