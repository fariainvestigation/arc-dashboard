import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedUser } from '../modules/motion-legal-integrated/tests/harness.mjs';
import { handle } from '../cloudflare-worker/research/research_worker.mjs';

const CASE='case-research-1';
async function envBase(){
  const env=makeEnv({valid:{email:'researcher@arc.test'},outsider:{email:'outsider@arc.test'}});
  env.FIRECRAWL_API_KEY='fc-test-secret-DO-NOT-LEAK';
  await seedUser(env,'researcher@arc.test','investigator',[CASE]);
  await seedUser(env,'outsider@arc.test','investigator',[]);
  return env;
}
function req(method,path,{token='valid',body,caseId=CASE}={}){
  const headers={'Cf-Access-Jwt-Assertion':token};
  if(caseId) headers['X-ARC-Case-ID']=caseId;
  if(body!==undefined) headers['content-type']='application/json';
  return new Request('https://arcdefensereport.com/research-api/'+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
}

test('research status is authenticated and never returns the Firecrawl key',async()=>{
  const env=await envBase(); const r=await handle(req('GET','status',{caseId:''}),env); const raw=await r.text();
  assert.equal(r.status,200); assert.ok(!raw.includes(env.FIRECRAWL_API_KEY));
});

test('unassigned users cannot research a case',async()=>{
  const env=await envBase(); const r=await handle(req('POST','search',{token:'outsider',body:{query:'policy'}}),env);
  assert.equal(r.status,403);
});

test('private and local scrape targets are rejected before provider access',async()=>{
  const env=await envBase(); const original=globalThis.fetch; let called=false; globalThis.fetch=async()=>{called=true;throw new Error('should not call provider')};
  try { const r=await handle(req('POST','scrape',{body:{url:'http://127.0.0.1/admin'}}),env); assert.equal(r.status,400); assert.equal(called,false); }
  finally { globalThis.fetch=original; }
});

test('search calls Firecrawl v2 with a server-side bearer token',async()=>{
  const env=await envBase(); const original=globalThis.fetch; let seen;
  globalThis.fetch=async(url,init)=>{seen={url:String(url),auth:init.headers.authorization};return new Response(JSON.stringify({success:true,data:[]}),{status:200,headers:{'content-type':'application/json'}})};
  try { const r=await handle(req('POST','search',{body:{query:'Massachusetts police pursuit policy'}}),env); const raw=await r.text(); assert.equal(r.status,200); assert.match(seen.url,/api\.firecrawl\.dev\/v2\/search/); assert.equal(seen.auth,'Bearer '+env.FIRECRAWL_API_KEY); assert.ok(!raw.includes(env.FIRECRAWL_API_KEY)); }
  finally { globalThis.fetch=original; }
});

test('saved web research is case-scoped and starts Unverified',async()=>{
  const env=await envBase();
  let r=await handle(req('POST','save',{body:{sourceUrl:'https://example.com/policy',title:'Policy',contentMarkdown:'Public policy text'}}),env);
  assert.equal(r.status,201); const saved=await r.json(); assert.equal(saved.status,'Unverified'); assert.match(saved.sha256,/^[a-f0-9]{64}$/);
  r=await handle(req('GET','list'),env); const list=await r.json(); assert.equal(list.results.length,1); assert.equal(list.results[0].verification_status,'Unverified');
});
