# ARC coding-agent guidance

Before editing Gemini integrations:

- Read `GEMINI_DEVELOPMENT.md`.
- Consult the official Gemini Docs MCP when available.
- Run `npm run gemini:doctor` and `npm test`.
- Do not expose provider credentials in browser code.
- Do not replace review/approval gates with automatic AI approval.
- Keep source provenance and case isolation intact.


## AI provider routing

- Keep Gemini as the evidence/tooling layer: case-chain extraction, grounded research, Google Maps grounding, native PDF review, code execution, and structured outputs.
- Use Anthropic Claude as the preferred final client-report writer and polish provider.
- Keep OpenAI as an optional fallback/comparison provider, not as normal-user choice.
- Never add provider keys to browser JavaScript, HTML, localStorage, case exports, or report exports. Use server env vars or Worker secrets only.
- The admin setup page is `21_AI_Provider_Setup.html`; it may generate setup commands but must not persist or transmit keys.
- Default model routing: Gemini `gemini-3.6-flash`, Claude `claude-sonnet-4-6`, OpenAI fallback `gpt-5.1` when enabled.


## Claude-only final report polish

Client-facing final report polishing is locked to Anthropic Claude through `/api/ai/final-polish`.
Gemini remains the tool/research/PDF-review engine and OpenAI remains an optional fallback for non-final-polish workflows, but neither Gemini nor OpenAI may polish final report text. All Claude-polished drafts are returned as `needs_review` and are not saved automatically.
Configure `ANTHROPIC_API_KEY` and optionally `FINAL_REPORT_CLAUDE_MODEL`; the endpoint ignores non-Claude provider selections.
