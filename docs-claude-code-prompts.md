# Biopunk housing portal — exact steps (Claude Desktop, no terminal)

## Step 0 — get Claude Code working without a terminal (10 min)
1. Download the Claude Desktop app from claude.com/download. Install, sign in with your Claude account.
2. Click the **Code** tab (top center). If it asks you to upgrade → Claude Code needs a paid plan (Pro or higher). If it asks you to sign in online → do it, then restart the app.
3. You now have Claude Code with a file editor, diff viewer, built-in terminal pane, and an app preview. No Node, no CLI install.
4. If you *do* want the real terminal later on a Mac: Cmd+Space → "Terminal" → paste `curl -fsSL https://claude.ai/install.sh | bash` → then `claude`. Not needed for this project.

## Step 1 — prepare the folder (10 min)
1. Make a folder: `biopunk-housing` on your Desktop. Inside it make a folder `sources`.
2. Put in `sources/`:
   - `incubator-housing-dashboard_5.html`
   - `contact-sheet.md`
   - `incubator-housing-report_3.pdf`
   - Google Sheet → File → Download → CSV (the main tab) → rename `existing-sheet.csv`
   - Notion "Giulia <> Elliot" page → ⋯ menu → Export → **Markdown & CSV** → unzip → copy the .md and any .csv in as `notion-tracker.md` / `notion-tracker.csv`. (Don't use the PDF — the Kitchen column is cut off.)
3. Put `CLAUDE.md` in `biopunk-housing/` (the root, next to `sources/`).
4. In Claude Desktop → Code tab → **Open folder** → pick `biopunk-housing`.
5. In the model picker, choose **Fable 5** for Steps 2–3. Switch to **Opus 4.8** for Step 4.

## Step 2 — data merge (paste this as one message, Fable 5)
```
Read CLAUDE.md fully before doing anything. Initialize git in this folder.

Build /data/build.ts that produces /data/properties.json in the canonical schema from CLAUDE.md. Use TypeScript run with tsx; set up package.json.

Order of operations:
1. Parse sources/notion-tracker.md (and .csv if present). Both tables (round 1 "contacted via phone/email with Alex" and round 2 "non contacted") become rows. Keep Walk (min) as walk_min_from_frontier verbatim, Est. $/mo as price_per_bed_est, Kitchen as given. Set notion_round, outreach_status, contacted_by per CLAUDE.md. Also extract the outreach email template in that file to /templates/outreach/_original-team-template.md.
2. Parse the `const P = [...]` array from sources/incubator-housing-dashboard_5.html — every entry becomes at least one row. Split multi-building entries (AAU cluster, Boston+Blue, Adams Point, Berkeley rooming block, "New on-market finds") into one row per building with a shared cluster_id.
3. Parse the contact <table> in that HTML plus sources/contact-sheet.md. Join contacts to rows by address/name (fuzzy). Write every uncertain join to /data/join-log.md. Preserve ⚠ flags as contact_verify=true.
4. Import sources/existing-sheet.csv rows as status=stale-verify.
5. Dedupe across sources by normalized address (e.g. Hive 1040 Folsom, FOUND Study 16 Turk, Kenmore 1570 Sutter, Monroe 1870 Sacramento, Urbanests, Foundry, 20mish/20 Mission, Mosser 1000 Market vs Mosser Hotel 54 4th — those last two are DIFFERENT buildings). When sources disagree: Notion wins on walk minutes + kitchen; report §6c–6e wins on status; keep the losing value in notes.
6. Open the PDF only for: per-room price ranges (§2, §4) where a row has no number; status changes (Da Vinci Villa taken, 3016 Jackson sold, etc.); and any round-5 properties missing from the HTML (Embassy Hotel, Hotel Whitcomb, McFee Center, Berkeley YMCA, 1515 Webster, CCA Founders Hall, NDNU).
7. Derive: east_bay from address; neighborhood normalized to the CLAUDE.md priority list (Tenderloin→Civic Center, Mid-Market→Civic Center/SoMa by street, Lower Nob Hill→Nob Hill, North Beach/Mission/Hayes Valley/Castro/Haight/Marina/Dogpatch stay as-is but are non-priority); beds_est = rooms × occupancy_assumption (1 for SRO/hotel rooms, 2 for dorm/co-living/apartment, state it per row); timeline_tags per CLAUDE.md; aau=true for every Academy of Art building.
8. Write /data/geocode.ts (Nominatim, cached in /data/geocache.json) for lat/lng and dist_to_frontier_mi from 995 Market St. Only compute transit minutes for rows that have no Notion walk time.
9. Add the two Fitzgerald (620 Post St) baseline rows flagged baseline=true, sept15_ready=false. Set sept15_ready=unknown everywhere else unless a source states availability (e.g. Notion 'Available Now', hostels = true).
10. Do NOT score yet — leave score null.

When done: print counts by neighborhood / type / status / source / East Bay vs SF; list rows missing price or contact; show me the 15 fuzziest joins and the 15 dedupe merges you made. Run build twice and confirm identical output.
```
→ Open `/data/join-log.md` and read it. Fix anything wrong by telling Claude ("those two are different buildings"). Don't move on until the merges look right — this is where wrong phone numbers come from.

## Step 3 — scoring + outreach templates (new session, Fable 5)
```
Read CLAUDE.md. Implement the Scoring section exactly in /data/score.ts, called at the end of build.ts. Use walk_min_from_frontier when present for the transit component. Store score_breakdown = {transit, price, kitchen, beds, caps_applied[], method_notes}.

Show me the top 30 by score: name, neighborhood, type, beds_est, $/bed, kitchen, walk_min, score, timeline_tags, outreach_status, source. Expectation: SoMa/Civic Center/Nob Hill/Union Square rows with kitchens and ≤$1,200/bed at the top (FOUND Study 16 Turk, UpMarket 221 7th, European Hostel, Mission Hotel Apartments, 6th Collective, Crystal Hotel should all be top 15); all East Bay at the bottom; both Fitzgerald baseline rows visible with their score so we can see what beats the current deal. If the Crystal Hotel ($500/room, 45 rooms, Mission) isn't top 15, explain why before changing anything.

Then write /templates/outreach/: four templates (sro-master-lease, dorm-institution, co-living-block, receiver-or-lender), each as email + 60-second call script, with {{name}}, {{address}}, {{rooms}}, {{price_ask}}, {{contact_name}}, {{sender_name}} variables. Base the voice on /templates/outreach/_original-team-template.md (Biopunk/Haus Fund, biopunk.house, haus.fund) but scale the ask: 40–50 residents, 30+ day same-room occupancy, 5–10 year master lease with purchase option, credit tenant, move fast. Under 150 words per email. The dorm-institution template must not mention the residency. Add a fifth short template femme-house for ~12 women, kitchen required, 3–6 months.

Finally: /data/push-to-sheet.ts (writes properties.json to the Google Sheet tab "Properties" via a service-account JSON in .env) and /data/pull-from-sheet.ts (reads the published CSV). Document both in README.md with the exact Google Cloud steps to get the service account.
```

## Step 4 — the UI (new session, switch model to Opus 4.8)
```
Read CLAUDE.md, especially Architecture. Scaffold /web with Vite + React + TypeScript + Tailwind. Data loads from VITE_SHEET_CSV_URL with /data/properties.json as dev fallback.

One page:
- Header: target cohort + $/bed, Frontier Tower anchor, count of active SF candidates, count needing verification, move-in Sept 15 vs Fitzgerald Sept 27 (12-night bridge gap) and a count of sept15_ready buildings, last-updated from the sheet.
- Ranked table, default sort score desc. Columns: rank, name, neighborhood, type, beds_est, $/bed, kitchen icon, walk min, sept15_ready, score (hover = breakdown), status, timeline tags, outreach status + contacted_by, source badge (report / notion / sheet). Sortable, sticky header, Fitzgerald baseline rows pinned with a distinct color.
- Filters: neighborhood (multi, priority ones first), type, timeline tag, kitchen yes/no, status, outreach status, "Show East Bay" toggle default OFF, "Show non-priority SF neighborhoods" toggle default ON.
- Row click → right drawer: all fields, contact block (tel:/mailto: links, ⚠ badge if contact_verify), source links, play, notes, an outreach log textarea, and a "Copy outreach email" button that picks the template by type and fills variables.
- Map tab (Leaflet + OSM): pins colored by score, Frontier Tower pinned distinctly, filters apply.
- Verify queue tab: contact_verify=true OR status=stale-verify OR price null OR kitchen unknown.
- Filters encoded in URL query params so a filtered view is shareable.

Design: dense ops tool, not a landing page. No hero. System dark/light. Use the frontend-design skill if available.

Add vercel.json + README with env vars. Run the dev server in the preview pane, click through table → drawer → map → verify queue, and fix anything broken before saying done.
```

## Step 5 — ship (15 min)
1. Google Sheet → File → Share → Publish to web → select the "Properties" tab → CSV → copy the URL into `web/.env` as `VITE_SHEET_CSV_URL`.
2. Run `npm run push-to-sheet` once (per README) so the sheet has the merged data.
3. Tell Claude: "deploy this to Vercel" — it'll walk you through `vercel login` in the built-in terminal pane. Send Elliot the link.
4. Weekly: edit the Sheet (or let agents edit it); the site updates itself.

## After
- Julia/Giulia adds rows in Notion → re-export → rerun build → push. Or one more prompt: "add /data/import-notion.ts using the Notion API; Notion wins on outreach_status and last_checked."
- AAU: every `aau=true` row is one pitch — the dorm-institution template, signed as an accelerator representative, never mentioning the residency.

---

## Step 6 — founder-facing live tracker + weekly AI email refresh (new session, Fable 5)
Decision: refresh runs on EMAIL, not phone calls. Every operator on the Inventory tab gets the `weekly-availability-check` template (in the spreadsheet's Templates tab) from housing@biopunk.house; replies are parsed into the sheet; no reply in 21 days = row greys out.
Two tabs, one sheet. "Pipeline" (whole-building deals, Elliot/Ria only) and "Inventory" (bookable beds, shared with every incoming founder). This step builds Inventory + the refresh engine.

```
Read CLAUDE.md. We are adding a second audience: incoming founders who need to find their own bed without asking anyone. Build:

1. Schema additions on every row: audience (pipeline | inventory), beds_available, price_now, min_stay_nights, bookable_online (bool), booking_url, last_verified (ISO), verified_via (booking-page | listing | email | call | resident | manual), confidence (high | med | low), next_check. Rows with a booking URL or a listing URL default to audience=inventory; whole-building / receiver / lender rows default to pipeline.

2. /refresh/ — a nightly job, runnable by GitHub Actions cron (write .github/workflows/refresh.yml) and locally:
   a. scrape-booking.ts — Playwright. For each inventory row with booking_url, query availability for 1 bed, 30 nights, check-in = today+14 and today+45. Record price and bookable yes/no. Start with: FOUND Study (foundstudy.com), UpMarket / 221 7th / 251 9th / Hotel Epik / Bartlett / Herbert / 1214 Polk / Columbus & Green St residences (find the operator's booking site), Urbanests, Hive, Foundry, 20mish, Sweden House, Hostelworld listings for European/Amsterdam/HI Downtown/USA Hostels/Adelaide/Green Tortoise/Samesun/ITH/Orange Village. Add a per-site adapter file; log sites that need a new adapter instead of failing.
   b. scrape-listings.ts — for rows with LoopNet/Crexi/Zillow/Apartments.com URLs: listing live? price? days on market? If gone → status=stale-verify, confidence=low.
   c. poll-inbox.ts — the core of the weekly loop. Reads the dedicated Gmail inbox via API; matches replies to rows by thread id; sends Claude (API) the reply text with the row and gets back {beds_available, price_now, min_stay_nights, notes}; writes with verified_via=email. Every Monday sends the weekly-availability-check template to EVERY inventory row with an email (booking-page rows included — the email confirms group rates the widget can't show), signed by a real team member with the 'read with help from an AI assistant' line. Thread IDs stored per row so replies match. Max 40 emails/day, never more than one email per operator per 7 days, and an unsubscribe line that sets do_not_email=true.
   d. normalize.ts — Claude API pass that reconciles a–c into the sheet, sets confidence (booking-page=high, email=med, listing-only=low), and writes a one-paragraph daily changelog to /refresh/CHANGELOG.md.
   e. No phone automation. Instead, weekly-digest.ts emails Ria + Elliot every Monday: what changed, who didn't reply in 21 days (so a human can call those — use the call-script-60s template), and new rows with low confidence.
   f. Seed everything from /sources/biopunk-housing-tracker.xlsx (tabs Pipeline, Inventory, Contacts, Templates) — that workbook is the starting dataset; keep its column names.

3. Staleness rules in the front end: last_verified ≤7d = green; 8–14d = amber; 15–45d = grey and −10 score; >45d = "unverified — ask" and hidden from the founder view by default.

4. Founder view (/web route /find): no login. Intake form: arrival date, nights, max $/month, private or shared OK, kitchen required?, max walk minutes to Frontier. Returns ranked inventory rows that are verified and match, each with price_now, beds_available, last_verified badge, booking link, and a "I took a bed here" button that decrements beds_available and writes verified_via=resident. Shareable URL with the form encoded.

5. README: how to set the Gmail API + service account secrets in GitHub Actions, how to add a new booking adapter, and what still needs a human (pipeline tab).

Run the scrapers once against 5 sites, show me the results and which adapters broke.
```

Honesty guardrails (keep these):
- A number with no `last_verified` never displays as current. Show the date next to every price/bed count.
- Never let Claude "estimate" beds_available. It reads a booking page, an email, or a call transcript, or it leaves the field null.
- Residents can't see the pipeline tab.
