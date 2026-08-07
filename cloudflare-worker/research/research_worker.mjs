import { verifyAccessJwt, json, now, uuid } from './lib.mjs';
const BASE='https://api.firecrawl.dev/v2'; const MAX_QUERY=500, MAX_URL=2048;
function cors(request,env){const origin=request.headers.get('origin')||'';const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);const h={'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'content-type, cf-access-jwt-assertion, x-arc-case-id','Vary':'Origin'};if(origin&&allowed.includes(origin))h['Access-Control-Allow-Origin']=origin;return h}
async function user(request,env){const id=await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion')||'',env);const u=await env.DB.prepare('SELECT * FROM legal_users WHERE email=?').bind(id.email).first();if(!u||u.status!=='active'||u.role==='pending')throw Object.assign(new Error('Account pending or disabled.'),{status:403});return u}
async function access(env,u,caseId){if(!caseId)throw Object.assign(new Error('Active ARC case required.'),{status:400});if(['administrator','supervisor'].includes(u.role))return;const a=await env.DB.prepare('SELECT 1 x FROM case_members WHERE case_id=? AND user_id=?').bind(caseId,u.email).first();if(!a)throw Object.assign(new Error('You are not assigned to this ARC case.'),{status:403})}
function ipv4Octets(h){
  const m=String(h||'').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(!m)return null;
  const parts=m.slice(1).map(Number);
  if(parts.some(n=>n>255))return null;
  return parts;
}
function privateIpv4Parts(parts){
  if(!parts||parts.length!==4)return false;
  const [a,b]=parts;
  if(a===0||a===10||a===127)return true;
  if(a===169&&b===254)return true;
  if(a===172&&b>=16&&b<=31)return true;
  if(a===192&&b===168)return true;
  if(a===100&&b>=64&&b<=127)return true; // CGNAT
  return false;
}
function privateHost(h){
  const host=String(h||'').toLowerCase().replace(/\.$/,'');
  if(!host||host==='localhost'||host==='::1'||host==='0.0.0.0'||host==='metadata.google.internal')return true;
  if(host.endsWith('.local')||host.endsWith('.localhost')||host.endsWith('.internal'))return true;
  const v4=ipv4Octets(host);
  if(v4&&privateIpv4Parts(v4))return true;
  // Short / incomplete IPv4 forms such as 127.1 or 10.1
  if(/^\d{1,3}(?:\.\d{1,3}){1,2}$/.test(host)){
    const nums=host.split('.').map(Number);
    if(nums[0]===0||nums[0]===10||nums[0]===127)return true;
    if(nums[0]===192&&(nums.length===1||nums[1]===168||nums[1]===undefined))return true;
    if(nums[0]===172&&nums.length>=2&&nums[1]>=16&&nums[1]<=31)return true;
    if(nums[0]===169&&nums.length>=2&&nums[1]===254)return true;
  }
  return false;
}
function privateIpv6(h){
  const x=String(h||'').replace(/^\[|\]$/g,'').toLowerCase();
  if(!x)return false;
  if(x==='::1'||x==='::'||x==='0:0:0:0:0:0:0:0'||x==='0:0:0:0:0:0:0:1')return true;
  if(x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe80:'))return true;
  const mapped=x.match(/^:?:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)||x.match(/^:?:ffff:([0-9a-f:]+)$/i);
  if(mapped){
    if(mapped[1].includes('.')){
      const parts=ipv4Octets(mapped[1]);
      return !parts||privateIpv4Parts(parts);
    }
    // :ffff:7f00:1 style
    const hex=mapped[1].replace(/:/g,'');
    if(/^[0-9a-f]+$/i.test(hex)&&hex.length<=8){
      const n=parseInt(hex.padStart(8,'0').slice(-8),16);
      const parts=[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
      return privateIpv4Parts(parts);
    }
  }
  return false;
}
function privateIp(h){return privateHost(h)||privateIpv6(h)}
function dnsAnswerValues(answer){
  const out=[];
  (answer||[]).forEach(a=>{
    if(!a||a.data==null)return;
    const data=String(a.data).toLowerCase().replace(/\.$/,'');
    // Ignore CNAME/DNAME host targets here; only treat address records as IPs.
    if(a.type===1||a.type==='A'||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(data)) out.push(data);
    else if(a.type===28||a.type==='AAAA'||data.includes(':')) out.push(data);
  });
  return out;
}
async function assertPublicDns(host,env){
  if(privateIp(host))throw Object.assign(new Error('Private or local URLs are not allowed.'),{status:400});
  if(env.ARC_DNS_SSRF_CHECK==='0')return;
  if(ipv4Octets(host)||host.includes(':'))return;
  const answers=[];
  for(const type of ['A','AAAA']){
    const r=await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(host)+'&type='+type,{headers:{accept:'application/dns-json'}});
    if(!r.ok)throw Object.assign(new Error('Could not verify public DNS for URL.'),{status:400});
    const j=await r.json().catch(()=>({}));
    answers.push(...dnsAnswerValues(j.Answer));
  }
  if(!answers.length)throw Object.assign(new Error('URL hostname did not resolve publicly.'),{status:400});
  if(answers.some(privateIp))throw Object.assign(new Error('URL resolves to a private or local address.'),{status:400});
}
async function publicUrl(v,env){let u;try{u=new URL(v)}catch{throw Object.assign(new Error('Invalid URL.'),{status:400})}if(!['http:','https:'].includes(u.protocol))throw Object.assign(new Error('Only HTTP(S) URLs are allowed.'),{status:400});const h=u.hostname.toLowerCase();await assertPublicDns(h,env);return u.toString()}
async function call(env,path,body){if(!env.FIRECRAWL_API_KEY)throw Object.assign(new Error('Firecrawl is not configured.'),{status:503});const r=await fetch(BASE+path,{method:'POST',headers:{authorization:'Bearer '+env.FIRECRAWL_API_KEY,'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({error:'Invalid provider response'}));if(!r.ok)throw Object.assign(new Error(j.error||j.message||('Firecrawl HTTP '+r.status)),{status:r.status===429?429:502});return j}
async function hash(s){const b=new TextEncoder().encode(String(s||''));const d=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function log(env,u,route,caseId,ok,n=0){try{await env.DB.prepare('INSERT INTO provider_log (id,at,actor,provider,route,case_id,request_chars,response_chars,ok) VALUES (?,?,?,?,?,?,?,?,?)').bind(uuid(),now(),u.email,'firecrawl',route,caseId||'',n,0,ok?1:0).run()}catch{}}
export async function handle(request,env){const h=cors(request,env);const origin=request.headers.get('Origin')||'';if(origin&&!h['Access-Control-Allow-Origin'])return json({error:'Origin not allowed'},403,h);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:h});try{const u=await user(request,env),url=new URL(request.url),path=url.pathname.replace(/^\/research-api\/?/,'').replace(/\/+$/,'');if(path==='status'&&request.method==='GET')return json({ok:true,configured:!!env.FIRECRAWL_API_KEY,provider:'firecrawl',role:u.role},200,h);const caseId=(request.headers.get('X-ARC-Case-ID')||'').trim();await access(env,u,caseId);if(path==='search'&&request.method==='POST'){const b=await request.json(),q=String(b.query||'').trim();if(!q||q.length>MAX_QUERY)throw Object.assign(new Error('Search query must be 1-'+MAX_QUERY+' characters.'),{status:400});const out=await call(env,'/search',{query:q,limit:Math.min(Math.max(Number(b.limit)||5,1),10),scrapeOptions:{formats:['markdown']}});await log(env,u,'search',caseId,true,q.length);return json({success:true,caseId,provider:'firecrawl',retrievedAt:now(),result:out},200,h)}if(path==='scrape'&&request.method==='POST'){const b=await request.json(),target=await publicUrl(String(b.url||'').slice(0,MAX_URL),env);const out=await call(env,'/scrape',{url:target,formats:['markdown'],onlyMainContent:b.onlyMainContent!==false});await log(env,u,'scrape',caseId,true,target.length);return json({success:true,caseId,provider:'firecrawl',retrievedAt:now(),sourceUrl:target,result:out},200,h)}if(path==='save'&&request.method==='POST'){const b=await request.json(),source=await publicUrl(String(b.sourceUrl||'').slice(0,MAX_URL),env),content=String(b.contentMarkdown||'').slice(0,2_000_000);if(!content)throw Object.assign(new Error('No research content supplied.'),{status:400});const rid=uuid(),sha=await hash(content);await env.DB.prepare(`INSERT INTO web_research_records (research_id,case_id,source_url,title,provider,retrieved_at,retrieved_by,content_markdown,content_hash,related_issue_id,verification_status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(rid,caseId,source,String(b.title||'').slice(0,500),'firecrawl',b.retrievedAt||now(),u.email,content,sha,String(b.relatedIssueId||''),'Unverified',String(b.notes||'').slice(0,4000),now()).run();return json({success:true,researchId:rid,sha256:sha,status:'Unverified'},201,h)}if(path==='list'&&request.method==='GET'){const q=await env.DB.prepare('SELECT research_id,source_url,title,provider,retrieved_at,retrieved_by,content_hash,related_issue_id,verification_status,notes FROM web_research_records WHERE case_id=? ORDER BY retrieved_at DESC').bind(caseId).all();return json({results:q.results||[]},200,h)}throw Object.assign(new Error('Research endpoint not found.'),{status:404})}catch(e){return json({error:e.message||'Research request failed.'},e.status||500,h)}}
export default{fetch:handle};
