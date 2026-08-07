# Installation

## Requirements
- Node.js 20+ (LTS recommended). SQLite is bundled (better-sqlite3); no separate
  database install.

## Windows
1. Extract the ARC_MOTION folder.
2. Double-click START_ARC.bat. It checks for Node, installs dependencies on
   first run, copies .env.example to .env, and opens the browser.

## Mac / Linux
    npm install
    npm start

## Configuration (.env)
    ARC_PORT=8790            # local port
    ARC_HOST=127.0.0.1       # never change to 0.0.0.0 on an untrusted network
    ARC_DATA_DIR=./data      # optional custom data directory
    ARC_AI_PROVIDER=         # anthropic | openai (blank = AI disabled)
    ARC_AI_MODEL=
    ARC_AI_KEY=              # server-side only; never appears in the browser

## Data location
    data/database/arc_motion.sqlite   - all records
    data/cases/<case-id>/originals    - uploaded discovery (never modified)
    data/cases/<case-id>/images       - Picture Center files
    data/backups                      - case backup ZIPs
    exports                           - generated filings

## Tests
    npm test
