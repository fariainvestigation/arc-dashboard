"use strict";
document.addEventListener("DOMContentLoaded", async()=>{
 const {q,qa,esc,fmtDate,toast}=ARC_UI; let people=[],filter="all";
 const tbody=q("#people-body"), empty=q("#people-empty"), table=q("#people-table");
 function counts(){
  const by=r=>people.filter(p=>p.roles.primary===r||p.roles.secondary?.includes(r)).length;
  q("#count-total").textContent=people.length;q("#count-defendants").textContent=by("defendant")+by("co_defendant");q("#count-witnesses").textContent=by("witness");q("#count-victims").textContent=by("victim");q("#count-officers").textContent=by("police_officer")+by("detective");q("#count-pending").textContent=people.filter(p=>!["completed","not_required"].includes(p.investigation.interviewStatus)).length;
 }
 function render(){counts();const rows=people.filter(p=>filter==="all"||p.roles.primary===filter||p.roles.secondary?.includes(filter));table.classList.toggle("hidden",!rows.length);empty.classList.toggle("hidden",!!rows.length);tbody.innerHTML=rows.map(p=>`<tr><td data-label="Name // ID"><strong>${esc(p.identity.fullName||"Unnamed")}</strong><br><small>${esc(p.id)}</small></td><td data-label="Role"><span class="role-badge role-${esc(p.roles.primary)}">${esc(ARC_PEOPLE.roleLabel(p.roles.primary))}</span></td><td data-label="Contact">${esc(p.contact.primaryPhone||"Not Listed")}<br><small>${esc((p.contact.emails||[])[0]||"")}</small></td><td data-label="Interview Status"><span class="status-badge status-${esc(p.investigation.interviewStatus)}">${esc(ARC_PEOPLE.roleLabel(p.investigation.interviewStatus))}</span></td><td data-label="Last Contact">${esc(fmtDate(p.investigation.lastContactDate))}</td><td data-label="Priority"><span class="priority-badge priority-${esc(p.caseRelationship.priority)}">${esc(ARC_PEOPLE.roleLabel(p.caseRelationship.priority))}</span></td><td data-label="Action"><button class="link-btn" data-open="${esc(p.id)}">Open Profile</button></td></tr>`).join("");qa("[data-open]").forEach(b=>b.addEventListener("click",()=>location.href=`profile.html?personId=${encodeURIComponent(b.dataset.open)}&caseId=${encodeURIComponent(ARC_PEOPLE.activeCaseId())}`));
 }
 people=await ARC_PEOPLE.listPeople();render();
 qa("[data-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;qa("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));render()}));
 q("#add-person").onclick=()=>location.href=`add-person.html?caseId=${encodeURIComponent(ARC_PEOPLE.activeCaseId())}`;
 q("#review-people").onclick=()=>location.href=`review.html?caseId=${encodeURIComponent(ARC_PEOPLE.activeCaseId())}`;
});
