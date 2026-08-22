# Biopunk Housing Portal

Shareable, auto-updating housing tracker for the 40–50 person Biopunk cohort in San Francisco.
**The Google Sheet is the database** (humans + agents edit it); the site is static (Vite + React) and reads the Sheet's published CSV; the refresh engine (Playwright + Gmail + Claude) keeps the **Inventory** tab honest every night. Full project context lives in [CLAUDE.md](CLAUDE.md).

Two audiences, one sheet:

| Tab | Who | What |
|---|---|---|
| **Pipeline** | Elliot + Ria | whole buildings / master-lease targets (69 rows). Human-worked; automation only checks whether listings are still live. |
| **Inventory** | every incoming founder (`/find`, no login) | bookable beds operating today (77 rows from the Giulia/Alex Notion tracker). Refreshed nightly by scrapers + the weekly email loop. |

## Quick start

```bash
npm install                      # root: data + refresh tooling
npm run build                    # sources/biopunk-housing-tracker.xlsx → data/properties.json (+ join-log, templates)
npm run geocode                  # one-off: Nominatim → data/geocache.json (1 req/s, ~3 min)
npm --prefix web install
npm run web:dev                  # http://localhost:5173  (ops view)  ·  /find (founder view)
```

Without any `.env` the site reads `data/properties.json`. Copy `.env.example` → `.env` (root) and `web/.env.example` → `web/.env` to go live.

## Repo map

```
sources/biopunk-housing-tracker.xlsx   the starting dataset (Pipeline, Inventory, Contacts, Outreach log, Templates, Weights)
data/
  build.ts          workbook → properties.json. Deterministic (byte-identical run-to-run). Never hand-edit the JSON.
  schema.ts         canonical row schema (CLAUDE.md) + Step-6 columns; SHEET_COLUMNS = tab column order
  score.ts          0–100 scoring exactly as CLAUDE.md; breakdown stored per row
  geocode.ts        Nominatim + cache; straight-line miles to 995 Market; transit heuristic only for address-level geocodes
  booking-sites.json  operator booking/listing URLs + adapter per Inventory row (researched 2026-08-22)
  push-to-sheet.ts / pull-from-sheet.ts   Sheet sync (service account) / published-CSV snapshot + diff
  lib/sheet.ts, lib/csv.ts               Google Sheets client; browser-safe CSV (de)serialisation
  properties.json, geocache.json, join-log.md, contacts.json   build outputs
templates/outreach/*.md   7 templates from the workbook (sro-master-lease, dorm-institution, co-living-block, receiver-or-lender, femme-house, weekly-availability-check, _original-team-template)
refresh/
  scrape-booking.ts   nightly: 1 bed × 30 nights at today+14 / today+45 per booking_url   (adapters/)
  scrape-listings.ts  nightly: LoopNet / Crexi / Zillow / Apartments.com still live? price? days on market?
  poll-inbox.ts       weekly loop: read replies (Claude extracts facts), Monday send to every inventory operator
  normalize.ts        reconcile → confidence → 21-day grey-out → CHANGELOG.md → rebuild → push to Sheet
  weekly-digest.ts    Monday email to Ria + Elliot: changes, 21-day non-responders (call list), low-confidence rows
  gmail-auth.ts       one-time refresh-token helper
  state/              verifications.json (folded into the build), scrape results, inbox cursor, changes.jsonl
  CHANGELOG.md        one paragraph per run
web/                  Vite + React + Tailwind + Leaflet. Routes: /  (ops: table · map · verify queue · drawer)   /find (founders)
sheet/apps-script.gs  the single write endpoint for the static site ("I took a bed here")
.github/workflows/refresh.yml   nightly + Monday cron
```

## Data flow

```
xlsx ──build.ts──▶ properties.json ──push-to-sheet──▶ Google Sheet (Pipeline / Inventory tabs)
                        ▲                                   │ publish to web (CSV)
   refresh/state/verifications.json                         ▼
   (scrapers · inbox · normalize)                      web app (Vercel)  ◀── founders: /find   ops: /
```

`build.ts` is the only writer of `properties.json`. Refresh jobs write verification fields (beds_available, price_now, last_verified, verified_via, confidence, …) either straight into the Sheet (when `SHEET_ID` is set) or into `refresh/state/verifications.json`, which `build.ts` folds back in — so the build stays deterministic and the JSON stays diff-able.

### Workbook column → schema field

| Workbook (Pipeline / Inventory) | schema |
|---|---|
| Name, Address / Address/area | `name`, `address` |
| Neighborhood, Region | `neighborhood_raw` → `neighborhood` (Tenderloin/Mid-Market → Civic Center, Lower Nob Hill → Nob Hill …), `region`, `east_bay`, `priority_neighborhood` |
| Walk min to Frontier, Walk source | `walk_min_from_frontier`, `walk_source` (Notion wins; pipeline values are neighbourhood estimates) |
| Type / Type (norm.) / Type (as tracked) | `type`, `type_raw` |
| Rooms/units, Occ. per room, Beds est, Capacity (as tracked) | `rooms`, `occupancy_assumption`, `beds_est`, `capacity_raw` |
| $/room low/high, $/bed est, Price as listed, Monthly for cohort | `price_per_room_low/high`, `price_per_bed_est`, `price_raw`, `monthly_total_45_est` |
| Kitchen / Kitchen (norm.) / (as tracked) | `kitchen`, `kitchen_raw` |
| Status, Source tier, Timeline tags, Sept-15 ready?, AAU?, Baseline? | `status`, `tier`, `timeline_tags[]`, `sept15_ready`, `aau`, `baseline` |
| Contact, Phone, Email / path, Contact section (+ Contacts tab ⚠) | `contact_*`, `contact_verify` |
| Source links, The play, Notes, SCORE, Outreach status, Contacted by, Notion round, Last checked | `source_links[]`, `play`, `notes`, `score_sheet`, `outreach_status`, `contacted_by`, `notion_round`, `last_checked(_raw)` |

Scores are recomputed by `score.ts`; the workbook's own SCORE is kept as `score_sheet` (145/146 rows identical; the one difference is Chapter SF where the workbook omitted the Sept-15 bonus).

## Scoring & staleness

Scoring is CLAUDE.md verbatim (transit 35 · price 30 · kitchen 15 · beds 20; caps for taken/sold/ruled-out and tourist-hotel-without-kitchen; +5 for `sept15_ready`). Unknown price = 5 pts, 61–100 beds = 12 pts (both match the workbook). Every row stores `score_breakdown` and the drawer shows it.

Staleness (front end, inventory rows only): `last_verified` ≤7d **green** · 8–14d **amber** · 15–45d **grey, −10** · >45d **"unverified — ask"** and hidden from `/find` unless the founder ticks "show unverified".

### Honesty guardrails (built in — keep them)
- A number with no `last_verified` is never shown as current; every price / bed count on `/find` carries its verification date, and estimates are labelled "est." with the source date.
- `beds_available` is **never estimated**: adapters only fill it when a page states a count, Claude's extraction is validated against the literal reply text (`refresh/lib/claude.ts → validateExtraction`), otherwise it stays `null` ("beds: ask").
- Founders never see the Pipeline tab: `/find` loads only `VITE_INVENTORY_CSV_URL`; deploy the founder site with `VITE_ENABLE_OPS=false` so the ops route and pipeline CSV don't exist in that build.

## Google Sheet setup (service account)

1. Create the Sheet (or open the existing one). Copy the id from the URL (`/spreadsheets/d/<SHEET_ID>/edit`) → `.env SHEET_ID`.
2. Google Cloud Console → create/select a project → **APIs & Services → Enable APIs** → enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create service account** (name: `biopunk-housing`), no roles needed → **Keys → Add key → JSON**. Download it.
4. Put the JSON in `.env` as `GOOGLE_SERVICE_ACCOUNT_JSON='{...one line...}'` (or save as `service-account.json` and set `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json`; it's git-ignored).
5. In the Sheet → **Share** → add the service account's `client_email` as **Editor**.
6. `npm run push-to-sheet` — writes the **Pipeline** and **Inventory** tabs (all `SHEET_COLUMNS`). Later runs use `--merge` to keep human-edited columns (status, outreach_status, notes, contact_*, do_not_email, beds_available…). `normalize.ts` already pushes with `--merge`.
7. **File → Share → Publish to web** → pick the *Inventory* tab → CSV → copy the link → `web/.env VITE_INVENTORY_CSV_URL`. Repeat for *Pipeline* → `VITE_PIPELINE_CSV_URL`. (Only publish Pipeline for the ops deployment.)
8. Optional write-back for the founder button: Extensions → Apps Script → paste `sheet/apps-script.gs` → Deploy → Web app (execute as me, anyone) → URL → `web/.env VITE_RESIDENT_WEBHOOK_URL`.

`npm run pull-from-sheet` downloads the published CSVs and diffs them against the local build (what did the team edit?).

## Gmail API (housing@biopunk.house)

1. Same Cloud project → enable **Gmail API** → **OAuth consent screen** (internal or testing, add the housing@ account as a test user) → **Credentials → OAuth client ID → Desktop app**. Note client id + secret.
2. `GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… npx tsx refresh/gmail-auth.ts` → open the URL, sign in **as housing@biopunk.house**, approve → it prints `GMAIL_REFRESH_TOKEN`.
3. Put all three in `.env` (local) and in GitHub secrets (below). `GMAIL_FROM`, `SENDER_NAME`, `DIGEST_TO` are plain variables.

Rules enforced by `poll-inbox.ts`: ≤40 emails/day, one email per operator address per 7 days (rows sharing an address — e.g. the 16 UrbaNests buildings — get one grouped email), every email ends with the "read with help from an AI assistant" + unsubscribe line, and a reply containing "unsubscribe" sets `do_not_email=true`. Replies are matched by Gmail thread id (stored per row in `email_thread_id`), falling back to sender address; unmatched replies are listed in `refresh/state/inbox.json` for a human.

## GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | From |
|---|---|
| `SHEET_ID` | sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the service-account JSON file contents |
| `ANTHROPIC_API_KEY` | console.anthropic.com (used for reply extraction + changelog paragraph; model `claude-opus-5`) |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | steps above |

Variables (not secret): `GMAIL_FROM`, `SENDER_NAME`, `DIGEST_TO` (comma-separated: Ria + Elliot).

The workflow runs nightly at 09:15 UTC (scrape → inbox read → normalize → push → commit state) and Mondays 16:00 UTC adds the weekly send + digest. `workflow_dispatch` has a "send" checkbox to force the weekly send. Without Gmail/Claude secrets the jobs dry-run and say so.

## Running the refresh locally

```bash
npm run refresh:booking -- --limit 5        # or --ids inv-a,inv-b  or --only urbanests,hostelworld
npm run refresh:listings -- --limit 10
npm run refresh:inbox                       # receive; add --send to force the Monday send; dry-run without creds
npm run refresh:normalize                   # → refresh/CHANGELOG.md, rebuild, push (--no-push to skip)
npm run refresh:digest                      # → email, or refresh/state/digest-<date>.md without creds
```

### First run (2026-08-22) against 9 sites

| Site | Adapter | Result |
|---|---|---|
| UrbaNests — 221 7th St | `urbanests` | ✓ private from $1,095, 3–4 month minimum (shared-room table not in page text — private only) |
| UrbaNests — UpMarket | `urbanests` | ✓ from $995, 3-month minimum |
| UrbaNests — European Hostel | `urbanests` | ✓ $545/bed; page gives the real address: **761 Minna St** (Notion said "Civic Center") |
| Hostelworld — Amsterdam Hostel | `hostelworld` | ✓ $23/night (≈$690/mo), bookable for Sept 5 and Oct 6 windows |
| Hostelworld — Orange Village | `hostelworld` | ✓ $23/night (≈$690/mo), bookable |
| Hive Coliving | `pricetext` | ✓ doubles $800 (4-mo lease) / $900 m2m; apply-by-form, no live vacancy |
| 20mish | `pricetext` | ✓ $1,625/room (site), vs $1,300 in the Notion tracker |
| FOUND Study | `foundstudy` | ⚠ **needs adapter** — foundstudy.com/sanfrancisco shows a password-gated "Guest Area" to headless Chrome; prices are on apartments.com / amberstudent instead |
| USA Hostels SF | — | ⚠ Yelp lists it **closed (Aug 2026)**; row set to `stale-verify` until someone calls |

Everything the adapters read is recorded with `verified_via=booking-page`; bed counts stayed `null` on all of them (none of these pages print a vacancy count).

## Adding a booking adapter

1. `refresh/adapters/<name>.ts` — export an `Adapter` (`name`, `hosts` regex, `check(page, row, windows)`) returning `{ ok, price_now, price_private_now, beds_available, bookable, min_stay_nights, evidence }`. Set `needs_adapter` with a reason instead of throwing when the page loads but can't be parsed. Only set `beds_available` when the page literally prints a count.
2. Register it in `refresh/adapters/index.ts`.
3. Point rows at it in `data/booking-sites.json` (`"adapter": "<name>"`, plus `booking_url`), `npm run build`, then `npm run refresh:booking -- --only <name>`.

## Front end

- `/` ops view: header stats (cohort, Frontier anchor, active SF candidates, needs-verification count, Sept 15 vs Sept 27 bridge, Sept-15-ready count, last updated), ranked table (default sort score desc, sortable, sticky header, Fitzgerald baseline rows pinned in blue), filters (neighbourhood with priority ones first, type, timeline tag, kitchen, status, outreach, audience, **East Bay off by default**, non-priority SF on by default) encoded in the URL, row drawer (all fields, tel:/mailto: contact with ⚠, live-availability block with dates, score breakdown, sources, notes, browser-local outreach log, "Copy outreach email" picking the template by type), map tab (Leaflet/OSM, pins coloured by score, dashed = neighbourhood-centroid location, Frontier Tower as a blue diamond), verify queue tab.
- `/find` founder view: intake form (arrival, nights, max $/month, private/shared, kitchen required, max walk) → verified inventory rows ranked by staleness-adjusted score, each with price/beds + verification date, booking link, email/call buttons and "I took a bed here" (Apps Script webhook, or a prefilled mailto when not configured). The form is encoded in the URL so a search is shareable.

Deploy: `vercel.json` builds `web/`. Set `VITE_INVENTORY_CSV_URL` (+ `VITE_PIPELINE_CSV_URL` for the ops deployment, or `VITE_ENABLE_OPS=false` for the founder-only one) in the Vercel project. Tell Claude "deploy this to Vercel" from this folder.

## What still needs a human

- **Pipeline tab** entirely: calls, tours, LOIs. The digest lists 21-day non-responders every Monday with the call script.
- The 18 pipeline rows with no price and the rows flagged ⚠ (see the verify queue).
- Confirming `sept15_ready` for anything that matters: the data says "unknown" for 68 rows.
- Phone-only operators (Harcourt, Mission Hotel, 6th Collective, Fitzgerald) — no site to scrape, no email on file.
- Reviewing `data/join-log.md` after any workbook change: contact joins are fuzzy on purpose and logged.
