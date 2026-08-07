import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pages=path.join(root,'DEPLOY_PAGES');
const skip=new Set(['_headers']);
let bad=[]; let count=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else{const rel=path.relative(pages,p).replace(/\\/g,'/');if(skip.has(rel))continue;const twin=path.join(root,rel);if(!fs.existsSync(twin)){bad.push(`${rel}: missing root twin`);continue}count++;if(!fs.readFileSync(p).equals(fs.readFileSync(twin)))bad.push(`${rel}: differs from root`)}}}
walk(pages);
if(bad.length){bad.forEach(x=>console.error('FAIL:',x));process.exit(1)}
console.log(`DEPLOY_PAGES sync check passed: ${count} files byte-identical to production root.`);
