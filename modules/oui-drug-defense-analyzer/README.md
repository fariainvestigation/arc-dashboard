# ARC OUI and Drug Defense Analyzer

Production-grade Massachusetts Criminal Defense Analysis Platform for defense attorneys and licensed investigators.

## Features

- **Document Ingestion & Extraction**: Accepts PDF, DOCX, TXT, PNG, JPG discovery files. Extracts structured page/paragraph maps and verifies exact verbatim quotes.
- **Dual-Layer Analysis Engine**:
  - **Layer A (Deterministic Rule Engine)**: Instant client-side verification of 15-minute observation window rules (501 CMR 2.13), exit order standards (Commonwealth v. Blais), SFST instruction deviations (NHTSA), cannabis lay opinion limits (Commonwealth v. Gerhardt), and statutory rights notices.
  - **Layer B (Gemini Model Inconsistency Engine)**: Model-assisted detection of internal timeline contradictions and document inconsistencies with citation guard validation.
- **Curated MA Authorities Table**: Curated Massachusetts statutes, regulations, and case law citations with local table verification and dynamic AI research.
- **Defense Report Generator**: Dual Client Plain Language and Attorney Tactical motion outlines with printable PDF, Markdown, and DOCX exports using `docx`.
- **Risk & Outcome Analytics**: Recharts visualizations for rule-derived motion win likelihood, retrograde BAC band modeling, procedural defect radar, and run history trends.
- **Collaborative Workspace**: Team notes, page/paragraph discovery pinning, and AI Legal Defense Assistant constrained to verified Massachusetts authority tables.

## Setup & Environment

1. Clone or download the project.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set your Gemini API key in `.env`:
   ```env
   VITE_GEMINI_API_KEY=your_actual_gemini_api_key
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```

## Legal Disclaimer

This tool assists licensed Massachusetts counsel, output is attorney work product, all citations and quotes must be independently verified against the source discovery before filing, and no output constitutes legal advice.
