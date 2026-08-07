import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'DEPLOY_PAGES');
const port = Number(process.env.PORT || 8080);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.mp4':'video/mp4','.mov':'video/quicktime','.pdf':'application/pdf'};
http.createServer((req,res)=>{
  let u; try{u=new URL(req.url,'http://localhost');}catch{res.writeHead(400);return res.end('Bad request');}
  let rel=decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if(!rel || rel.endsWith('/')) rel += 'index.html';
  const target=path.resolve(root,rel);
  if(target!==root && !target.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(target,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':types[path.extname(target).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(target).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log(`ARC static production preview: http://127.0.0.1:${port}/`));
