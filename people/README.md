# ARC People / Parties Involved Module v1.0

## Open
Run a local web server from this folder and open `index.html`. Example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/`.

## Included screens
- `index.html` — Parties dashboard and role filters.
- `profile.html` — Reusable individual profile with ten tabs.
- `add-person.html` — Create/edit person form and duplicate warning.
- `review.html` — AI-extracted people review queue.

## Current operation
The standalone package uses browser localStorage so all four pages work without the main ARC package. The permanent integration point is `window.ARCPeopleBridge`; see `assets/main-arc-bridge.example.js`. No API key is stored in this ZIP.

## Previously uploaded report extraction
Use the prompt files under `prompts/` through the approved server-side ARC AI service. Validate output against `schemas/people-extraction.schema.json`, then send the JSON to `ARC_PEOPLE.ingestExtraction(payload)` or import it from the Review page. Every AI-extracted person remains pending until the investigator approves, edits, merges, or rejects the record.

## Demonstration JSON
`schemas/sample-extraction.demo.json` is clearly marked demo-only. Import it from the Review page to test the workflow. It is not automatically loaded.

## Security
This prototype contains no API key and no real case data. In production, Cloudflare Access and the existing Worker/D1 case record remain the sources of authentication and persistence. Do not use localStorage as the production source of truth.
