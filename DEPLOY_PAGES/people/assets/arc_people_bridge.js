"use strict";
(function () {
  if (!(location.protocol === "https:" || location.protocol === "http:")) return;

  const MODULE_ID = "people";
  const cache = new Map();
  const queues = new Map();
  const now = () => new Date().toISOString();
  const clone = (value) => {
    if (globalThis.structuredClone) return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
  const makeId = (prefix) => {
    if (globalThis.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };
  const blank = () => ({ version: 1, people: [], extractions: [], audit: [], updatedAt: now() });
  const normalizeState = (value) => {
    const state = value && typeof value === "object" ? value : {};
    return {
      version: 1,
      people: Array.isArray(state.people) ? state.people : [],
      extractions: Array.isArray(state.extractions) ? state.extractions : [],
      audit: Array.isArray(state.audit) ? state.audit.slice(0, 500) : [],
      updatedAt: state.updatedAt || now()
    };
  };
  const endpoint = (caseId) => `/sync/module-state?caseId=${encodeURIComponent(caseId)}&module=${MODULE_ID}`;
  const requireCase = (caseId) => {
    const id = String(caseId || "").trim();
    if (!id) throw new Error("No active ARC case selected. Open a case from the Case Dashboard first.");
    return id;
  };
  const audit = (state, action, detail) => {
    state.audit.unshift({ id: makeId("AUD"), action, detail: detail || {}, at: now() });
    state.audit = state.audit.slice(0, 500);
  };

  async function load(caseId, force) {
    caseId = requireCase(caseId);
    if (!force && cache.has(caseId)) return cache.get(caseId);
    const res = await fetch(endpoint(caseId), { credentials: "include" });
    if (!res.ok) throw new Error(`People sync failed (HTTP ${res.status}).`);
    const body = await res.json();
    const entry = { payload: normalizeState(body && body.payload), rev: Math.max(0, Number(body && body.rev || 0)) };
    cache.set(caseId, entry);
    return entry;
  }

  async function persist(caseId, entry) {
    const headers = { "Content-Type": "application/json" };
    if (entry.rev > 0) headers["If-Match"] = String(entry.rev);
    const res = await fetch(endpoint(caseId), {
      method: "PUT",
      credentials: "include",
      headers,
      body: JSON.stringify({ payload: entry.payload, expectedRev: entry.rev })
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 || res.status === 428) {
      cache.delete(caseId);
      const current = body && body.conflict && body.conflict.currentRev;
      throw new Error(`People data changed in another ARC session${current != null ? ` (server revision ${current})` : ""}. Reload before saving to prevent overwriting newer work.`);
    }
    if (!res.ok) throw new Error(body.error || `People sync failed (HTTP ${res.status}).`);
    entry.rev = Math.max(1, Number(body.rev || entry.rev + 1));
    cache.set(caseId, entry);
    return entry;
  }

  function mutate(caseId, fn) {
    caseId = requireCase(caseId);
    const previous = queues.get(caseId) || Promise.resolve();
    const task = previous.catch(() => undefined).then(async () => {
      const current = await load(caseId, false);
      const entry = { payload: clone(current.payload), rev: current.rev };
      const result = await fn(entry.payload);
      entry.payload.updatedAt = now();
      await persist(caseId, entry);
      return result;
    });
    const gate = task.then(() => undefined, () => undefined);
    queues.set(caseId, gate);
    gate.then(() => { if (queues.get(caseId) === gate) queues.delete(caseId); });
    return task;
  }

  function normalizePerson(input, caseId, existing) {
    if (window.ARC_PEOPLE && typeof window.ARC_PEOPLE.normalizePerson === "function") {
      return window.ARC_PEOPLE.normalizePerson(input, caseId, existing || {});
    }
    return Object.assign({}, existing || {}, input || {}, { caseId });
  }

  function extractionFrom(raw, payload) {
    raw = raw || {};
    payload = payload && typeof payload === "object" ? payload : {};
    return {
      extractionId: raw.extractionId || makeId("EXT"),
      documentId: raw.documentId || payload.documentId || "",
      documentName: raw.documentName || payload.documentName || "",
      nameAsWritten: raw.nameAsWritten || (raw.identity && raw.identity.fullName) || raw.fullName || "Unnamed Person",
      identity: raw.identity || { fullName: raw.fullName || raw.nameAsWritten || "" },
      roles: raw.roles || { primarySuggestedRole: raw.primaryRole || "other", secondarySuggestedRoles: [] },
      contact: raw.contact || { phones: [], emails: [], addresses: [] },
      professional: raw.professional || {},
      attorney: raw.attorney || {},
      caseRelationship: raw.caseRelationship || {},
      statements: raw.statements || [],
      evidenceLinks: raw.evidenceLinks || [],
      timelineEvents: raw.timelineEvents || [],
      interviewReferences: raw.interviewReferences || [],
      sourceReferences: raw.sourceReferences || [],
      confidence: raw.confidence || { overall: 0 },
      limitations: raw.limitations || [],
      reviewStatus: raw.reviewStatus || "pending_review",
      possibleMatches: raw.possibleMatches || [],
      createdAt: raw.createdAt || now()
    };
  }

  window.ARCPeopleBridge = Object.freeze({
    async listPeople(caseId) {
      return clone((await load(caseId, false)).payload.people);
    },
    async getPerson(caseId, personId) {
      const person = (await load(caseId, false)).payload.people.find((p) => p.id === personId);
      return person ? clone(person) : null;
    },
    async savePerson(caseId, input) {
      return mutate(caseId, (state) => {
        const existing = state.people.find((p) => p.id === input.id) || {};
        const person = normalizePerson(input, caseId, existing);
        const index = state.people.findIndex((p) => p.id === person.id);
        if (index >= 0) state.people[index] = person; else state.people.push(person);
        audit(state, index >= 0 ? "person.updated" : "person.created", { personId: person.id });
        return clone(person);
      });
    },
    async deletePerson(caseId, personId) {
      return mutate(caseId, (state) => {
        state.people = state.people.filter((p) => p.id !== personId);
        audit(state, "person.deleted", { personId });
        return true;
      });
    },
    async listPersonExtractions(caseId) {
      return clone((await load(caseId, false)).payload.extractions);
    },
    async ingestPersonExtraction(caseId, payload) {
      return mutate(caseId, (state) => {
        const rows = Array.isArray(payload) ? payload : ((payload && payload.people) || []);
        const added = [];
        for (const raw of rows) {
          const extraction = extractionFrom(raw, payload);
          const index = state.extractions.findIndex((x) => x.extractionId === extraction.extractionId);
          if (index >= 0) {
            const prior = state.extractions[index];
            state.extractions[index] = Object.assign({}, extraction, {
              reviewStatus: prior.reviewStatus || extraction.reviewStatus,
              approvedPersonId: prior.approvedPersonId || extraction.approvedPersonId
            });
          } else {
            state.extractions.push(extraction);
          }
          added.push(extraction);
        }
        audit(state, "extraction.ingested", { count: added.length });
        return clone(added);
      });
    },
    async updateExtraction(caseId, extractionId, patch) {
      return mutate(caseId, (state) => {
        const index = state.extractions.findIndex((x) => x.extractionId === extractionId);
        if (index < 0) throw new Error("Extraction not found");
        state.extractions[index] = Object.assign({}, state.extractions[index], patch || {}, { updatedAt: now() });
        audit(state, "extraction.updated", { extractionId, patch: patch || {} });
        return clone(state.extractions[index]);
      });
    },
    async approveExtraction(caseId, extractionId) {
      return mutate(caseId, (state) => {
        const extraction = state.extractions.find((x) => x.extractionId === extractionId);
        if (!extraction) throw new Error("Extraction not found");
        if (extraction.approvedPersonId) {
          const existing = state.people.find((p) => p.id === extraction.approvedPersonId);
          if (existing) return clone(existing);
        }
        const person = normalizePerson({
          identity: extraction.identity,
          roles: { primary: (extraction.roles && extraction.roles.primarySuggestedRole) || "other", secondary: (extraction.roles && extraction.roles.secondarySuggestedRoles) || [] },
          contact: extraction.contact,
          professional: extraction.professional,
          attorney: extraction.attorney,
          caseRelationship: extraction.caseRelationship,
          statements: extraction.statements,
          evidenceLinks: extraction.evidenceLinks,
          timelineEventLinks: extraction.timelineEvents,
          reportLinks: [{ documentId: extraction.documentId, documentName: extraction.documentName }],
          sourceReferences: extraction.sourceReferences,
          review: { status: "approved", approvedFromExtraction: extraction.extractionId }
        }, caseId, {});
        state.people.push(person);
        extraction.reviewStatus = "approved";
        extraction.approvedPersonId = person.id;
        audit(state, "extraction.approved", { extractionId, personId: person.id });
        return clone(person);
      });
    },
    async rejectExtraction(caseId, extractionId) {
      return this.updateExtraction(caseId, extractionId, { reviewStatus: "rejected" });
    },
    async mergeExtraction(caseId, extractionId, personId) {
      return mutate(caseId, (state) => {
        const extraction = state.extractions.find((x) => x.extractionId === extractionId);
        const person = state.people.find((p) => p.id === personId);
        if (!extraction || !person) throw new Error("Extraction or person not found");
        const merged = Object.assign({}, person, {
          sourceReferences: [...(person.sourceReferences || []), ...(extraction.sourceReferences || [])],
          statements: [...(person.statements || []), ...(extraction.statements || [])],
          reportLinks: [...(person.reportLinks || []), { documentId: extraction.documentId, documentName: extraction.documentName }],
          metadata: Object.assign({}, person.metadata || {}, { updatedAt: now() })
        });
        state.people[state.people.findIndex((p) => p.id === personId)] = merged;
        extraction.reviewStatus = "merged";
        extraction.approvedPersonId = personId;
        audit(state, "extraction.merged", { extractionId, personId });
        return clone(merged);
      });
    },
    async resetPrototype(caseId) {
      return mutate(caseId, (state) => {
        state.people = [];
        state.extractions = [];
        state.audit = [];
        audit(state, "people.reset", {});
        return true;
      });
    },
    async refresh(caseId) {
      cache.delete(requireCase(caseId));
      return clone((await load(caseId, true)).payload);
    }
  });
})();
