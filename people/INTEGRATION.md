# Main ARC Integration Map

1. Place the module after Initial Case Analysis and before Evidence.
2. Pass `caseId` in the URL or set `sessionStorage.arcActiveCaseId`.
3. Implement `window.ARCPeopleBridge` before `assets/store.js` loads.
4. Route uploaded report text to the approved server-side AI endpoint using the prompts in `prompts/`.
5. Validate the AI response against `schemas/people-extraction.schema.json`.
6. Save extraction results in the active case as `pending_review`.
7. Never promote extracted records directly to approved people.
8. Reuse approved person IDs in statements, evidence, timeline, interviews, reports, and the final report.

The module intentionally does not include an API key or invent an endpoint because the main ARC Worker contract was not supplied with this Stitch package.
