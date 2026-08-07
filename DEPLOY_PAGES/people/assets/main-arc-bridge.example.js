"use strict";
/* Load this file before assets/store.js inside the main ARC program and replace the example endpoints with the existing ARC Worker/D1 contract. */
window.ARCPeopleBridge = {
  async listPeople(caseId) { throw new Error("Connect listPeople to the existing ARC case record."); },
  async getPerson(caseId, personId) { throw new Error("Connect getPerson to the existing ARC case record."); },
  async savePerson(caseId, person) { throw new Error("Connect savePerson to the existing ARC case record."); },
  async listPersonExtractions(caseId) { throw new Error("Connect listPersonExtractions to the existing ARC case record."); },
  async ingestPersonExtraction(caseId, payload) { throw new Error("Connect ingestPersonExtraction to the approved server-side AI analysis service."); }
};
