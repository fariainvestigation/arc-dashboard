import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'DEPLOY_PAGES');
if(!fs.existsSync(root)){ console.error('DEPLOY_PAGES is missing.'); process.exit(1); }
const failures=[]; let checked=0;
function walk(dir,out=[]){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p,out);else out.push(p);}return out;}
for(const file of walk(root).filter(f=>f.endsWith('.html'))){
  const source=fs.readFileSync(file,'utf8');
  const markup=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const re=/(?:href|src|poster|action)\s*=\s*["']([^"']+)["']/gi; let m;
  while((m=re.exec(markup))){
    const ref=m[1].trim();
    if(!ref||/^(?:#|data:|blob:|mailto:|tel:|javascript:|https?:|\/\/)/i.test(ref))continue;
    if(ref.startsWith('/')){failures.push(`${path.relative(root,file)}: root-absolute local path ${ref}`);continue;}
    const clean=decodeURIComponent(ref.split(/[?#]/)[0]).replace(/\\/g,'/'); if(!clean)continue;
    let target=path.resolve(path.dirname(file),clean); if(clean.endsWith('/')) target=path.join(target,'index.html');
    checked++; if(!fs.existsSync(target)) failures.push(`${path.relative(root,file)}: missing ${ref}`);
  }
}
if(failures.length){failures.forEach(x=>console.error('FAIL:',x));console.error(`Production Pages link check failed: ${failures.length} issue(s).`);process.exit(1);}
console.log(`Production Pages link check passed: ${checked} static references, 0 broken/root-absolute paths.`);
