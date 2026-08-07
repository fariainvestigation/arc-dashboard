(function () {
  "use strict";
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c];});}
  function reportText(){
    var nodes=document.querySelectorAll("main, article, [contenteditable='true'], textarea, .report, .document, .editor");
    var parts=[];
    nodes.forEach(function(n){var v=n.tagName==="TEXTAREA"?n.value:n.innerText;if(v&&v.trim().length>40)parts.push(v.trim());});
    return (parts.join("\n\n")||document.body.innerText||"").slice(0,120000);
  }
  function ensure(){
    if(document.getElementById("arc-ai-review-button"))return;
    var b=document.createElement("button");
    b.id="arc-ai-review-button"; b.type="button"; b.textContent="AI Report Review";
    b.style.cssText="position:fixed;right:18px;bottom:18px;z-index:99998;background:#0b1726;color:#fff;border:1px solid #b59461;border-radius:8px;padding:11px 15px;font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.22)";
    var panel=document.createElement("section");
    panel.id="arc-ai-review-panel"; panel.hidden=true;
    panel.style.cssText="position:fixed;right:18px;bottom:70px;z-index:99999;width:min(520px,calc(100vw - 36px));max-height:72vh;overflow:auto;background:#fff;color:#17212c;border:1px solid #cbd3dc;border-radius:10px;padding:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:13px/1.45 system-ui";
    panel.innerHTML="<div style='display:flex;justify-content:space-between;gap:12px'><strong>Combined AI report review</strong><button type='button' data-close>Close</button></div><p>Uses current web grounding and ARC validation functions. Findings are suggestions only and require human review.</p><div style='padding:10px 0;border-top:1px solid #e1e5ea'><label style='display:block;font-weight:600;margin-bottom:6px'>Claude-only final report polish</label><button type='button' data-claude-polish>Polish final report with Claude</button><div data-claude-status style='margin-top:7px;color:#667386'>Client-facing final report polishing is locked to Claude. Gemini and OpenAI remain available for review, extraction, or fallback tasks, but cannot polish final report text.</div></div><div style='padding:10px 0;border-top:1px solid #e1e5ea;border-bottom:1px solid #e1e5ea'><label style='display:block;font-weight:600;margin-bottom:6px'>Native PDF review</label><input type='file' accept='application/pdf' data-pdf><button type='button' data-review-pdf style='margin-left:6px'>Review PDF</button><div data-pdf-status style='margin-top:7px;color:#667386'>Uses Google Document AI OCR first when configured, then Gemini PDF review. Findings require human review.</div></div><div data-body></div>";
    b.onclick=async function(){
      panel.hidden=false;
      var body=panel.querySelector("[data-body]");
      body.innerHTML="<p>Reviewing report…</p>";
      try{
        if(!window.ARCProviders||!ARCProviders.reportReview)throw new Error("Report review service is unavailable.");
        var result=await ARCProviders.reportReview({reportText:reportText(),page:location.pathname});
        var html="<h3>Review summary</h3><div style='white-space:pre-wrap'>"+esc(result.text||"No narrative returned.")+"</div>";
        html+="<h3>Deterministic section check</h3><ul>"+(result.sectionResults||[]).map(function(x){return"<li>"+esc(x.name)+": <strong>"+(x.present?"present":"missing")+"</strong></li>";}).join("")+"</ul>";
        if((result.findings||[]).length)html+="<h3>Findings</h3>"+result.findings.map(function(f){return"<div style='border-top:1px solid #ddd;padding:8px 0'><strong>"+esc(f.severity)+" · "+esc(f.category)+"</strong><div>"+esc(f.statement)+"</div><div><em>"+esc(f.recommendation)+"</em></div></div>";}).join("");
        if((result.citations||[]).length)html+="<h3>External citations</h3><ul>"+result.citations.map(function(c){return"<li><a target='_blank' rel='noopener' href='"+esc(c.url)+"'>"+esc(c.title||c.url)+"</a></li>";}).join("")+"</ul>";
        html+="<p><strong>Status:</strong> needs review · Preview tool combination</p>";
        html+="<p><strong>AI retention:</strong> "+esc(result.retention||"not reported")+". ARC requests deletion after each completed review unless an administrator explicitly enables continued interaction state.</p>";
        body.innerHTML=(window.ARC&&ARC.safeHtml)?ARC.safeHtml(html):html;
        try{localStorage.setItem("arc_report_review_"+location.pathname,JSON.stringify(result));}catch(_){}
      }catch(e){body.innerHTML="<p style='color:#a33a35'>"+esc(e.message||e)+"</p>";}
    };

    panel.querySelector("[data-claude-polish]").onclick=async function(){
      var status=panel.querySelector("[data-claude-status]");
      var body=panel.querySelector("[data-body]");
      status.textContent="Sending current report text to Claude for polish…";
      try{
        if(!window.ARCProviders||!ARCProviders.finalReportPolish)throw new Error("Claude final-polish service is unavailable.");
        var current=reportText();
        if(current.length<100)throw new Error("Report text is too short to polish.");
        var result=await ARCProviders.finalReportPolish({
          reportText:current,
          style:"professional",
          maxTokens:7000
        });
        status.textContent="Claude-only polish complete. Review before copying into the final report.";
        body.innerHTML="<h3>Claude-only polished draft</h3><p><strong>Status:</strong> needs human review · not saved automatically · Gemini/OpenAI final polish blocked</p><textarea style='width:100%;min-height:320px;font:13px/1.45 system-ui'>"+esc(result.text||"")+"</textarea>";
        try{localStorage.setItem("arc_claude_polish_"+location.pathname,JSON.stringify({model:result.model,text:result.text,createdAt:new Date().toISOString()}));}catch(_){}
      }catch(e){status.textContent=e.message||String(e);}
    };

    panel.querySelector("[data-review-pdf]").onclick=async function(){
      var fileInput=panel.querySelector("[data-pdf]");
      var status=panel.querySelector("[data-pdf-status]");
      var file=fileInput.files&&fileInput.files[0];
      if(!file){status.textContent="Choose a PDF first.";return;}
      if(file.type!=="application/pdf"&&!/\.pdf$/i.test(file.name)){status.textContent="Only PDF documents are supported.";return;}
      if(file.size>30*1024*1024){status.textContent="This browser review accepts PDFs up to 30 MB. Larger files should be uploaded through the case document store.";return;}
      status.textContent="Uploading PDF. ARC will run Google Document AI OCR first if configured, then Gemini review…";
      try{
        if(!window.ARCProviders||!ARCProviders.pdfReview)throw new Error("Native PDF review service is unavailable.");
        var base64=await new Promise(function(resolve,reject){
          var reader=new FileReader();
          reader.onerror=function(){reject(new Error("Could not read the PDF."));};
          reader.onload=function(){resolve(String(reader.result||"").split(",").pop());};
          reader.readAsDataURL(file);
        });
        var result=await ARCProviders.pdfReview({fileName:file.name,mimeType:"application/pdf",base64:base64});
        var review=result.review||{};
        var body=panel.querySelector("[data-body]");
        var sections=["facts","tables","visualEvidence","inconsistencies","missingPages","unreadableAreas","reportRisks"];
        var html="<h3>PDF review: "+esc(file.name)+"</h3><div style='white-space:pre-wrap'>"+esc(review.summary||"Review completed.")+"</div>";
        sections.forEach(function(key){
          var items=Array.isArray(review[key])?review[key]:[];
          if(!items.length)return;
          html+="<h4>"+esc(key.replace(/([A-Z])/g," $1"))+"</h4><ul>"+items.map(function(item){
            var text=typeof item==="string"?item:(item.statement||item.description||item.value||JSON.stringify(item));
            var page=item&&item.page?" · page "+esc(item.page):"";
            return"<li>"+esc(text)+page+" · needs review</li>";
          }).join("")+"</ul>";
        });
        if(result.ocr){
          html+="<h4>OCR layer</h4><p><strong>Mode:</strong> "+esc(result.ocr.mode||"not reported")+" · <strong>Used:</strong> "+(result.ocr.used?"yes":"no")+(result.ocr.pageCount?" · <strong>Pages:</strong> "+esc(result.ocr.pageCount):"")+(result.ocr.textLength?" · <strong>Text chars:</strong> "+esc(result.ocr.textLength):"")+"</p>";
          if(result.ocr.error)html+="<p style='color:#9a3412'>OCR fallback note: "+esc(result.ocr.error)+"</p>";
        }
        if((result.citations||[]).length)html+="<h4>File citations</h4><ul>"+result.citations.map(function(c){return"<li>"+esc(c.fileName||file.name)+(c.pageNumber?" · page "+esc(c.pageNumber):"")+"</li>";}).join("")+"</ul>";
        html+="<p><strong>Status:</strong> needs review. OCR output and Gemini temporary file references require human verification; Gemini file references expire after approximately 48 hours.</p>";
        body.innerHTML=(window.ARC&&ARC.safeHtml)?ARC.safeHtml(html):html;
        try{localStorage.setItem("arc_pdf_review_"+location.pathname+"_"+file.name,JSON.stringify(result));}catch(_){}
        status.textContent="PDF review completed.";
      }catch(e){status.textContent=e.message||String(e);}
    };

    panel.querySelector("[data-close]").onclick=function(){panel.hidden=true;};
    document.body.appendChild(b);document.body.appendChild(panel);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ensure);else ensure();
})();