# ARC Shared Case Sync - Setup

This makes you and one colleague see and edit the same cases from separate
laptops. It runs on Cloudflare, which you already use for arcdefensereport.com.
No new servers to run. One-time setup is about 15 minutes.

You do this once. Your colleague does nothing except sign in to the site.

---

## What you need

- The Cloudflare account that already hosts arcdefensereport.com
- The `wrangler` command line tool: `npm install -g wrangler`
- Sign in once: `wrangler login`

---

## Step 1. Create the shared database

From inside this `arc-sync-backend` folder:

    wrangler d1 create arc-cases

It prints a block that includes a `database_id`. Copy that id and paste it into
`wrangler.toml`, replacing `PASTE_YOUR_DATABASE_ID_HERE`.

---

## Step 2. Deploy the sync worker

    wrangler deploy

This publishes the worker. Note the URL it prints (something like
`https://arc-case-sync.YOURNAME.workers.dev`).

---

## Step 3. Route /sync to the worker on your domain

So the tools can call the backend on the same domain (and inherit your existing
Access login), add a route in the Cloudflare dashboard:

1. Cloudflare dashboard -> your `arcdefensereport.com` zone
2. Workers Routes -> Add route
3. Route: `arcdefensereport.com/sync*`
4. Worker: `arc-case-sync`
5. Save

---

## Step 4. Put the worker behind your existing Access login

The worker must sit behind the same Cloudflare Access application that already
protects the site, so it receives the signed-in email.

1. Zero Trust dashboard -> Access -> Applications
2. Open the application covering `arcdefensereport.com`
3. Confirm its path covers `/sync` (a domain-wide app already does)
4. Under Policies, make sure both people's emails are allowed:
   - your email
   - your colleague's email

That email list is your entire user management. To add or remove someone later,
edit this policy. Nothing in the code changes.

---

## Step 5. Confirm it works

1. Open `https://arcdefensereport.com/01_Report_Generator.html`
2. Top bar should show a filled dot and `Shared - your@email` instead of
   `Local only`
3. Create a test case
4. Have your colleague open the same URL and sign in with their email
5. They should see your test case. Edits from either laptop appear on the other
   after a moment or on reload.

---

## How it behaves

- The shared case list lives in the cloud database and is the source of truth.
- Each laptop keeps a local copy, so the tool still opens and works if the
  network drops. It reconnects and syncs when it comes back.
- If you both edit the same case at once, the second save is asked to reload the
  newer version first, so nobody silently overwrites the other. You will see a
  brief "Case updated elsewhere" notice and the page refreshes.
- API keys and uploaded media never go to this backend. Only case records do.

---

## Cost

Cloudflare's free tier covers D1 and Workers far beyond two investigators'
volume. Expect this to cost nothing.

---

## What this does NOT sync (yet)

Only the Report Generator's case list is wired to the backend in this build.
Uploaded document and media blobs still live in each browser. If you want media
to sync too, that is a follow-on step using R2 (object storage); ask and it can
be added. For case facts, notes, people, timelines, and generated reports, this
is enough for two people to work the same matters.
