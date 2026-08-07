# ARC AI gateway

One entry point for every model call in ARC. Two providers, one rule:

- **Claude** writes motions and the final report.
- **Gemini** does everything else.

The rule is enforced server-side from the task name. A module names a task; it
cannot name a provider or a model. Both keys are Worker secrets and neither
reaches a browser.

## Deploy

    cd cloudflare-worker/ai
    wrangler secret put GOOGLE_API_KEY
    wrangler secret put ANTHROPIC_API_KEY
    wrangler deploy

Route `/ai/*` on arcdefensereport.com to this Worker, behind the same Cloudflare
Access application that gates the rest of ARC.

## Use from a module

    <script src="arc_ai_client.js"></script>

    const facts = await ARCAI.run("evidence.extract", { prompt, schema });   // Gemini
    const draft = await ARCFinalReport.draft({ caseId });                    // Claude

## Adding a module

Add one line to `TASK_POLICY` in `arc_ai_gateway.mjs` and one entry to the task
list in `arc_ai_client.js`. There is no default-allow: a task that is not in the
table is refused.

## Retiring the browser key

`arc_gemini_client.js` reads `ARC_GEMINI_KEY_V1` from localStorage, which means
anyone with the browser profile or devtools can read it. Once a module is moved
to `ARCAI.run`, remove its key-entry UI and clear the stored key. The gateway is
the only path that should remain.
