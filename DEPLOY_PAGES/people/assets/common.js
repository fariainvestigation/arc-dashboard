"use strict";
(function(){
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  function toast(message,type="info"){
    let el=q("#arc-toast"); if(!el){el=document.createElement("div");el.id="arc-toast";el.className="arc-toast";document.body.appendChild(el)}
    el.textContent=message;el.dataset.type=type;el.classList.add("show");clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove("show"),2800);
  }
  function route(name){
    const value=window.ARC_PEOPLE_CONFIG.routes[name];
    if(value){location.href=value;return} toast(`${name.replace(/([A-Z])/g," $1")} route will connect to the main ARC program.`,"warning");
  }
  function bindCommon(){
    qa("[data-route]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();route(el.dataset.route)}));
    qa("[data-page]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();location.href=el.dataset.page}));
    const caseId=window.ARC_PEOPLE.activeCaseId();sessionStorage.setItem(window.ARC_PEOPLE_CONFIG.activeCaseKey,caseId);
    qa("[data-case-id]").forEach(el=>el.textContent=caseId);
  }
  function esc(v){return String(v??"").replace(/[&<>'\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
  function fmtDate(v){if(!v)return "Not Listed";const d=new Date(v+(/^\d{4}-\d{2}-\d{2}$/.test(v)?"T00:00:00":""));return isNaN(d)?v:d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}
  window.ARC_UI={q,qa,toast,route,bindCommon,esc,fmtDate};
  document.addEventListener("DOMContentLoaded",bindCommon);
})();
