# ARC AI Gateway — Production

The server-side task policy is authoritative:

- Claude: motion drafting/revision and final-report drafting/revision.
- Gemini: discovery, evidence, forensic, timeline, OUI and other investigative analysis.

Every model request requires verified Cloudflare Access identity and an authorized active ARC case. Modules may request an approved task but may not choose a provider or arbitrary model.

Secrets:

```powershell
npx wrangler secret put GOOGLE_API_KEY --config=cloudflare-worker/ai/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config=cloudflare-worker/ai/wrangler.toml
```

No browser API key is supported in production. The compatibility Gemini client proxies through this Worker and does not send a provider secret from the browser.
