/* ARC report store - IndexedDB bodies + metadata. */
(function(g){'use strict';var DB='arc-report-store-v1',STORE='reports';
function open(){return new Promise(function(res,rej){if(!indexedDB)return rej(new Error('IndexedDB unavailable'));var r=indexedDB.open(DB,1);r.onupgradeneeded=function(){if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'reportId'})};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}
function tx(mode,fn){return open().then(function(db){return new Promise(function(res,rej){var t=db.transaction(STORE,mode),s=t.objectStore(STORE),out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=function(){res(out&&out.result!==undefined?out.result:out)};t.onerror=function(){rej(t.error)}})})}
function put(meta,body){var rec=Object.assign({},meta,{body:body||{}});if(!rec.reportId)throw new Error('reportId required');return tx('readwrite',function(s){return s.put(rec)}).then(function(){return meta})}
function allMeta(){return tx('readonly',function(s){return s.getAll()}).then(function(rows){return (rows||[]).map(function(r){var m=Object.assign({},r);delete m.body;return m})})}
function getBody(id){return tx('readonly',function(s){return s.get(id)}).then(function(r){return r?r.body:null})}
function remove(id){return tx('readwrite',function(s){return s.delete(id)}).then(function(){return true})}
function removeByCase(cid){return tx('readwrite',function(s){var r=s.getAll();r.onsuccess=function(){(r.result||[]).filter(function(x){return x.caseId===cid}).forEach(function(x){s.delete(x.reportId)})};return r}).then(function(){return true})}
g.ARCReportStore={put:put,allMeta:allMeta,getBody:getBody,remove:remove,removeByCase:removeByCase};})(window);
