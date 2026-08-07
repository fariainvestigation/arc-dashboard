"use strict";
(function () {
  const cfg = window.ARC_PEOPLE_CONFIG;
  const now = () => new Date().toISOString();
  const normalize = (v) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const blankState = () => ({ version: 1, cases: {} });

  function activeCaseId() {
    const params = new URLSearchParams(location.search);
    return params.get("caseId") || sessionStorage.getItem(cfg.activeCaseKey) || localStorage.getItem(cfg.activeCaseKey) || (window.ARCUnified && window.ARCUnified.getCase && (window.ARCUnified.getCase().caseId || window.ARCUnified.getCase().id)) || cfg.defaultCaseId;
  }
  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(cfg.storageKey) || "null");
      return parsed && parsed.cases ? parsed : blankState();
    } catch (_) { return blankState(); }
  }
  function saveState(state) { localStorage.setItem(cfg.storageKey, JSON.stringify(state)); }
  function ensureCase(state, caseId) {
    if (!caseId) throw new Error("No active ARC case selected. Open a case from the Case Dashboard first.");
    state.cases[caseId] ||= { people: [], extractions: [], audit: [], updatedAt: now() };
    return state.cases[caseId];
  }
  function id(prefix) {
    if (globalThis.crypto && globalThis.crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function bridge() { return window[cfg.bridgeName] || null; }
  async function bridgeCall(method, ...args) {
    const b = bridge();
    if (b && typeof b[method] === "function") return b[method](...args);
    return undefined;
  }
  function audit(caseData, action, detail) {
    caseData.audit.unshift({ id: id("AUD"), action, detail, at: now() });
    caseData.audit = caseData.audit.slice(0, 500);
  }
  function normalizePerson(input, caseId, existing={}) {
    const identity = input.identity || {};
    const contact = input.contact || {};
    const roles = input.roles || {};
    const fullName = input.fullName || identity.fullName || [input.firstName ?? identity.firstName, input.middleName ?? identity.middleName, input.lastName ?? identity.lastName, input.suffix ?? identity.suffix].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
    return {
      id: existing.id || input.id || id("PRSN"), caseId,
      identity: {
        firstName: input.firstName ?? identity.firstName ?? "",
        middleName: input.middleName ?? identity.middleName ?? "",
        lastName: input.lastName ?? identity.lastName ?? "",
        suffix: input.suffix ?? identity.suffix ?? "",
        fullName,
        aliases: Array.isArray(input.aliases) ? input.aliases : (identity.aliases || []),
        dateOfBirth: input.dateOfBirth ?? identity.dateOfBirth ?? "",
        age: input.age ?? identity.age ?? "",
        gender: input.gender ?? identity.gender ?? "",
        photograph: input.photograph ?? identity.photograph ?? ""
      },
      roles: {
        primary: input.primaryRole ?? roles.primary ?? roles.primarySuggestedRole ?? "other",
        secondary: Array.isArray(input.secondaryRoles) ? input.secondaryRoles : (roles.secondary || roles.secondarySuggestedRoles || [])
      },
      contact: {
        primaryPhone: input.primaryPhone ?? contact.primaryPhone ?? (contact.phones && contact.phones[0]) ?? "",
        secondaryPhone: input.secondaryPhone ?? contact.secondaryPhone ?? (contact.phones && contact.phones[1]) ?? "",
        emails: Array.isArray(input.emails) ? input.emails : (contact.emails || [input.email].filter(Boolean)),
        addresses: Array.isArray(input.addresses) ? input.addresses : (contact.addresses || []),
        preferredMethod: input.preferredMethod ?? contact.preferredMethod ?? "",
        contactRestrictions: input.contactRestrictions ?? contact.contactRestrictions ?? "",
        verified: Boolean(input.contactVerified ?? contact.verified),
        verifiedDate: input.verifiedDate ?? contact.verifiedDate ?? "",
        verificationSource: input.verificationSource ?? contact.verificationSource ?? ""
      },
      professional: { ...(existing.professional || {}), ...(input.professional || {}) },
      attorney: { ...(existing.attorney || {}), ...(input.attorney || {}), name: input.attorneyContact ?? input.attorney?.name ?? existing.attorney?.name ?? "" },
      caseRelationship: {
        ...(existing.caseRelationship || {}), ...(input.caseRelationship || {}),
        summary: input.description ?? input.caseRelationship?.summary ?? existing.caseRelationship?.summary ?? "",
        priority: input.priority ?? input.caseRelationship?.priority ?? existing.caseRelationship?.priority ?? "normal"
      },
      investigation: {
        ...(existing.investigation || {}), ...(input.investigation || {}),
        interviewStatus: input.interviewStatus ?? input.investigation?.interviewStatus ?? existing.investigation?.interviewStatus ?? "not_started",
        lastContactDate: input.lastContactDate ?? input.investigation?.lastContactDate ?? existing.investigation?.lastContactDate ?? "",
        recommendedQuestions: input.recommendedQuestions ?? input.investigation?.recommendedQuestions ?? existing.investigation?.recommendedQuestions ?? []
      },
      statements: input.statements ?? existing.statements ?? [],
      interviews: input.interviews ?? existing.interviews ?? [],
      reportLinks: input.reportLinks ?? existing.reportLinks ?? [],
      evidenceLinks: input.evidenceLinks ?? existing.evidenceLinks ?? [],
      timelineEventLinks: input.timelineEventLinks ?? existing.timelineEventLinks ?? [],
      relationships: input.relationships ?? existing.relationships ?? [],
      contactAttempts: input.contactAttempts ?? existing.contactAttempts ?? [],
      notes: input.notes ?? existing.notes ?? [],
      sourceReferences: input.sourceReferences ?? existing.sourceReferences ?? [],
      review: { status: "approved", conflicts: [], ...(existing.review || {}), ...(input.review || {}) },
      metadata: {
        createdAt: existing.metadata?.createdAt || now(),
        createdBy: existing.metadata?.createdBy || "local-prototype",
        updatedAt: now(),
        updatedBy: "local-prototype"
      }
    };
  }
  function duplicateMatches(people, candidate, excludeId="") {
    const c = normalizePerson(candidate, candidate.caseId || activeCaseId(), candidate.id ? candidate : {});
    return people.filter(p => p.id !== excludeId).map(p => {
      const fields = [];
      const pn = normalize(p.identity.fullName), cn = normalize(c.identity.fullName);
      if (pn && cn && pn === cn) fields.push("full name");
      if (p.identity.dateOfBirth && c.identity.dateOfBirth && p.identity.dateOfBirth === c.identity.dateOfBirth) fields.push("date of birth");
      if (normalize(p.contact.primaryPhone) && normalize(p.contact.primaryPhone) === normalize(c.contact.primaryPhone)) fields.push("phone");
      const pe=(p.contact.emails||[]).map(normalize), ce=(c.contact.emails||[]).map(normalize);
      if (pe.some(x => x && ce.includes(x))) fields.push("email");
      if (p.professional?.badgeNumber && c.professional?.badgeNumber && normalize(p.professional.badgeNumber) === normalize(c.professional.badgeNumber)) fields.push("badge number");
      const score = Math.min(100, fields.length * 25 + (pn && cn && (pn.includes(cn) || cn.includes(pn)) ? 15 : 0));
      return { person: p, fields, score };
    }).filter(x => x.score >= 40).sort((a,b)=>b.score-a.score);
  }

  const API = {
    activeCaseId,
    async listPeople(caseId=activeCaseId()) {
      const remote = await bridgeCall("listPeople", caseId); if (remote !== undefined) return remote;
      const state=loadState(); return ensureCase(state, caseId).people;
    },
    async getPerson(personId, caseId=activeCaseId()) {
      const remote=await bridgeCall("getPerson", caseId, personId); if (remote !== undefined) return remote;
      return (await API.listPeople(caseId)).find(p=>p.id===personId) || null;
    },
    async savePerson(input, caseId=activeCaseId()) {
      const remote=await bridgeCall("savePerson", caseId, input); if (remote !== undefined) return remote;
      const state=loadState(), c=ensureCase(state,caseId);
      const existing=c.people.find(p=>p.id===input.id) || {};
      const person=normalizePerson(input,caseId,existing);
      const i=c.people.findIndex(p=>p.id===person.id);
      if(i>=0)c.people[i]=person;else c.people.push(person);
      c.updatedAt=now(); audit(c,i>=0?"person.updated":"person.created",{personId:person.id}); saveState(state); return person;
    },
    async deletePerson(personId, caseId=activeCaseId()) {
      const remote=await bridgeCall("deletePerson",caseId,personId); if(remote!==undefined)return remote;
      const state=loadState(), c=ensureCase(state,caseId); c.people=c.people.filter(p=>p.id!==personId); audit(c,"person.deleted",{personId});saveState(state);return true;
    },
    async findDuplicates(candidate, excludeId="", caseId=activeCaseId()) { return duplicateMatches(await API.listPeople(caseId), candidate, excludeId); },
    async listExtractions(caseId=activeCaseId()) {
      const remote=await bridgeCall("listPersonExtractions",caseId); if(remote!==undefined)return remote;
      const state=loadState(); return ensureCase(state,caseId).extractions;
    },
    async ingestExtraction(payload, caseId=activeCaseId()) {
      const remote=await bridgeCall("ingestPersonExtraction",caseId,payload); if(remote!==undefined)return remote;
      const state=loadState(), c=ensureCase(state,caseId);
      const people = Array.isArray(payload) ? payload : (payload.people || []);
      const added=[];
      for(const raw of people){
        const extraction={
          extractionId: raw.extractionId || id("EXT"),
          documentId: raw.documentId || payload.documentId || "",
          documentName: raw.documentName || payload.documentName || "",
          nameAsWritten: raw.nameAsWritten || raw.identity?.fullName || raw.fullName || "Unnamed Person",
          identity: raw.identity || {fullName:raw.fullName||raw.nameAsWritten||""},
          roles: raw.roles || {primarySuggestedRole:raw.primaryRole||"other",secondarySuggestedRoles:[]},
          contact: raw.contact || {phones:[],emails:[],addresses:[]},
          professional: raw.professional || {}, attorney: raw.attorney || {}, caseRelationship: raw.caseRelationship || {},
          statements: raw.statements || [], evidenceLinks: raw.evidenceLinks || [], timelineEvents: raw.timelineEvents || [], interviewReferences: raw.interviewReferences || [],
          sourceReferences: raw.sourceReferences || [], confidence: raw.confidence || {overall:0}, limitations: raw.limitations || [],
          reviewStatus: raw.reviewStatus || "pending_review", possibleMatches: raw.possibleMatches || [], createdAt: now()
        };
        const existingIndex=c.extractions.findIndex(x=>x.extractionId===extraction.extractionId);
        if(existingIndex>=0){const prior=c.extractions[existingIndex];c.extractions[existingIndex]={...extraction,reviewStatus:prior.reviewStatus||extraction.reviewStatus,approvedPersonId:prior.approvedPersonId||extraction.approvedPersonId};}else c.extractions.push(extraction);
        added.push(extraction);
      }
      audit(c,"extraction.ingested",{count:added.length});saveState(state);return added;
    },
    async updateExtraction(extractionId, patch, caseId=activeCaseId()) {
      const remote=await bridgeCall("updateExtraction",caseId,extractionId,patch); if(remote!==undefined)return remote;
      const state=loadState(), c=ensureCase(state,caseId), i=c.extractions.findIndex(x=>x.extractionId===extractionId);
      if(i<0)throw new Error("Extraction not found"); c.extractions[i]={...c.extractions[i],...patch,updatedAt:now()}; audit(c,"extraction.updated",{extractionId,patch});saveState(state);return c.extractions[i];
    },
    async approveExtraction(extractionId, caseId=activeCaseId()) {
      const remote=await bridgeCall("approveExtraction",caseId,extractionId); if(remote!==undefined)return remote;
      const state=loadState(), c=ensureCase(state,caseId), x=c.extractions.find(e=>e.extractionId===extractionId);
      if(!x)throw new Error("Extraction not found");
      if(x.approvedPersonId){const approved=c.people.find(p=>p.id===x.approvedPersonId);if(approved)return approved;}
      const person=normalizePerson({
        identity:x.identity, roles:{primary:x.roles?.primarySuggestedRole||"other",secondary:x.roles?.secondarySuggestedRoles||[]},
        contact:x.contact, professional:x.professional, attorney:x.attorney, caseRelationship:x.caseRelationship,
        statements:x.statements, evidenceLinks:x.evidenceLinks, timelineEventLinks:x.timelineEvents,
        reportLinks:[{documentId:x.documentId,documentName:x.documentName}], sourceReferences:x.sourceReferences,
        review:{status:"approved",approvedFromExtraction:x.extractionId}
      },caseId,{});
      c.people.push(person); x.reviewStatus="approved"; x.approvedPersonId=person.id; audit(c,"extraction.approved",{extractionId,personId:person.id}); saveState(state); return person;
    },
    async rejectExtraction(extractionId, caseId=activeCaseId()) {
      const remote=await bridgeCall("rejectExtraction",caseId,extractionId); if(remote!==undefined)return remote;
      return API.updateExtraction(extractionId,{reviewStatus:"rejected"},caseId);
    },
    async mergeExtraction(extractionId, personId, caseId=activeCaseId()) {
      const remote=await bridgeCall("mergeExtraction",caseId,extractionId,personId); if(remote!==undefined)return remote;
      const state=loadState(), c=ensureCase(state,caseId), x=c.extractions.find(e=>e.extractionId===extractionId), p=c.people.find(e=>e.id===personId);
      if(!x||!p)throw new Error("Extraction or person not found");
      const merged={...p,sourceReferences:[...(p.sourceReferences||[]),...(x.sourceReferences||[])],statements:[...(p.statements||[]),...(x.statements||[])],reportLinks:[...(p.reportLinks||[]),{documentId:x.documentId,documentName:x.documentName}],metadata:{...p.metadata,updatedAt:now()}};
      c.people[c.people.findIndex(e=>e.id===personId)]=merged; x.reviewStatus="merged";x.approvedPersonId=personId;audit(c,"extraction.merged",{extractionId,personId});saveState(state);return merged;
    },
    async resetPrototype(caseId=activeCaseId()) {
      const remote=await bridgeCall("resetPrototype",caseId); if(remote!==undefined)return remote;
      const state=loadState(); delete state.cases[caseId]; saveState(state); return true;
    },
    normalizePerson,
    roleLabel(role){return String(role||"other").replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());}
  };
  window.ARC_PEOPLE = API;
})();
