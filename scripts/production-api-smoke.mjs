const base = String(process.env.ARC_BASE_URL || '').replace(/\/$/, '');
const jwt = String(process.env.ARC_TEST_ACCESS_JWT || '').trim();
if(!base || !jwt){
  console.error('NOT RUN: Set ARC_BASE_URL=https://arcdefensereport.com and ARC_TEST_ACCESS_JWT=<valid Cloudflare Access JWT>.');
  process.exit(2);
}
const endpoints = [
  ['/sync/whoami','sync identity'],
  ['/ai/status','AI gateway'],
  ['/legal-api/provider-status','Legal/CourtListener gateway'],
  ['/research-api/status','Firecrawl research gateway']
];
for(const [route,label] of endpoints){
  const res = await fetch(base+route,{headers:{'Cf-Access-Jwt-Assertion':jwt,'Authorization':`Bearer ${jwt}`},redirect:'manual'});
  const text = await res.text();
  if(!res.ok){
    console.error(`FAIL ${label}: HTTP ${res.status} ${text.slice(0,300)}`);
    process.exit(1);
  }
  if(/AIza|sk-ant-|FIRECRAWL_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|COURTLISTENER_API_KEY/.test(text)){
    console.error(`FAIL ${label}: response appears to expose secret material.`);
    process.exit(1);
  }
  console.log(`PASS ${label}: ${route}`);
}
console.log('Authenticated production API smoke passed.');
