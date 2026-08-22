# Biopunk Housing Portal — project context

## What this is
A shareable, auto-updating housing portal for a 40–50 person accelerator cohort in San Francisco.
Source of truth is a Google Sheet (humans + agents edit it). The front end is a static site that
reads the Sheet's published CSV. No backend. No auth. Deploy to Vercel.

## Hard constraints (from the Aug 2026 planning call — do not relax these)
- **House 40–50 people cost-effectively. Avoid hotels where possible.**
- **Geography: SF only.** Priority neighborhoods, in order: SoMa, Nob Hill, Civic Center, FiDi,
  Union Square, NoPa/Panhandle. **East Bay is ruled out** (too far from Frontier Tower) — keep
  East Bay rows in the data but score them to the bottom and hide behind a toggle. Never delete them.
- **Target price: ~$1,000/month per BED.** Shared rooms from ~$850; singles $1,500–2,500.
  Block agreements bring price down. Add a small overhead line for community manager + communal food.
- **Anchor point for distance/transit: Frontier Tower, 995 Market St, SF 94103.**
- **Kitchen access is a first-class field.** Three months without a kitchen was the failure mode
  of the current hotel setup. "No kitchen" is a hard negative, not a footnote.
- **Timelines to tag every property against:**
  - `bridge-sept`: Sept 15–27 gap (arrival Sept 15, Fitzgerald starts Sept 27)
  - `q1-2027`: the real target — something better than the current setup
  - `femme-house`: 2550 Van Ness / Minerva-adjacent or any safe-house candidate
  - `alum-house`: alum house (operational Sept 1)
  - `expansion`: 60+ headroom / whole-building takeover
- AAU (Academy of Art) is a strong target with ~50 properties; currently stonewalled via the
  residency channel. Flag every AAU row with `aau: true` so they can be pitched as a block.

## Data sources (all in /sources/)
1. `incubator-housing-dashboard_5.html` — **primary structured source.** The `const P = [...]`
   array has ~59 properties with fields `{t, name, addr, size, price, play, note, links}`.
   Tier codes: jw=Jewel, bg=Bargain/distressed, pr=Pair/cluster, pv=Premium value,
   mk=On-market, da=Direct approach, co=Co-living/bridge. The `<table>` at the bottom is the contact sheet.
2. `contact-sheet.md` — contacts keyed by property name/address. ⚠ marks numbers to verify by phone.
3. `incubator-housing-report_3.pdf` — the narrative (costs, legal, 5 research rounds). Use ONLY to
   fill gaps the HTML lacks (e.g. per-room cost tables in §2–4, status changes in §6c–6e).
   Do not re-parse the whole PDF into rows.
4. `existing-sheet.csv` — export of the May 2026 Google Sheet (whole-house hunt). Its column
   schema is the one Elliot already uses — extend it, don't replace it. Its 12 listings are
   mostly stale (June 1 target); import them with `status: stale-verify`.
5. `notion-tracker.md` + `notion-tracker.csv` — **the Giulia/Alex Notion tracker ("Giulia <> Elliot" page).**
   ~90 SF-only properties in two tables: round 1 ("contacted via phone/email with Alex") and
   round 2 ("non contacted"). Columns: Property, Address/Area, Type, Walk (min) from Frontier,
   Capacity, Price (as listed), Est. $/mo (sort), Kitchen. This is the most criteria-aligned
   source — its walk-minutes and kitchen values win over any other source for the same building.
   Map: round 1 rows → `outreach_status: contacted`, `contacted_by: Alex`; round 2 → `not-contacted`.
   It also contains the team's existing outreach email template (Dr. Alejandro Gener / Giulia
   Sironi, Biopunk/Haus Fund, biopunk.house + haus.fund) — reuse that voice and sender framing.
   The PDF export truncates the Kitchen column; prefer the Markdown/CSV export.

## Known facts about the current setup (use as baseline rows)
- Current deal: two floors at the **Fitzgerald, 620 Post St** (co-living side: ~20 bedrooms,
  singles from $1,595, mini-fridge+sink common room; hotel side: 50 rooms, $110–140/night, no kitchen).
  Aim is the whole building next year. Score both sides so every candidate is compared to it.
- Femhaus: ~10–12 women, needs its own location + kitchen (tag `femme-house`).
- **Dates (confirmed):** ideal move-in is **Sept 15** (arrival; orientation Sept 17–18).
  The Fitzgerald only starts **Sept 27**. So the bridge window is **Sept 15–27 (12 nights)**,
  and any building that can take the cohort on Sept 15 is strictly better than the Fitzgerald.
  Add a boolean `sept15_ready` (true / false / unknown) and show it in the table. In the
  `bridge-sept` tag logic: 12-night availability is the bar, not a month.

## Canonical row schema (one row = one property; pairs/clusters = one row per building + `cluster_id`)
```
id, name, address, neighborhood, east_bay (bool), lat, lng,
dist_to_frontier_mi, transit_min_to_frontier,
type (sro-hotel | tourist-hotel | dorm | co-living | apartment-block | sfh | campus | other),
rooms, beds_est, occupancy_assumption (1|2|3 per room),
price_per_room_low, price_per_room_high, price_per_bed_est, monthly_total_45_est,
kitchen (private | communal | none | unknown), common_space (text), furnished (bool|unknown),
bath (private | shared | unknown),
status (active | dark | receivership | on-market | taken | sold | stale-verify | ruled-out),
timeline_tags (list), aau (bool), cluster_id,
tier (from source), score (0–100), score_breakdown (json),
contact_name, contact_org, contact_phone, contact_email, contact_verify (bool), contact_path,
source_links (list), play (one-line pitch), notes,
outreach_status (not-contacted | contacted | called | emailed | toured | loi | dead), contacted_by,
walk_min_from_frontier (from Notion when present; else computed), notion_round (1|2|null), last_checked
```

## Scoring (0–100) — criteria in the order the team stated them
- Transit time to Frontier — 35 pts (≤10 min walk = full; >45 min transit = 0; East Bay = 0 and `east_bay` flag)
- Price per bed — 30 pts (≤$1,000 = full; linear to 0 at $2,200)
- Kitchen — 15 pts (communal or private = full; none = 0; unknown = 5)
- Bed count fit — 20 pts (40–60 beds in one building = full; 20–39 = 12 (pair candidate); <20 = 4; >100 = 15)
- Hard caps: `status in (taken, sold, ruled-out)` → score 0. Tourist hotel with no kitchen → cap at 40.
- Bonus: `sept15_ready = true` → +5 (surfaces the Sept 15 options above the Fitzgerald baseline).
- Store the breakdown so the UI can show why.

## Architecture
- `/data/build.ts` — parses sources → `properties.json` (deterministic, re-runnable, never hand-edit the JSON).
- `/data/geocode.ts` — geocodes addresses + computes straight-line distance to 995 Market; transit
  minutes via a heuristic (walk ≤1 mi, else Muni/BART estimate) unless a Maps API key is in `.env`.
- `/data/push-to-sheet.ts` — writes `properties.json` to the Google Sheet (service account or Apps Script).
- `/web` — Vite + React + Tailwind. Reads the Sheet's published CSV at load. Single page:
  ranked table (default sort: score), filters (neighborhood, type, timeline tag, kitchen, East Bay toggle),
  property drawer (all fields + contact + outreach log + "copy outreach email" button),
  map view (Leaflet, Frontier Tower pinned), and a "needs verification" queue.
- `/templates/outreach/` — 4 email/call templates: sro-master-lease, dorm-institution (AAU / CCA),
  co-living-block, receiver-or-lender. Variables pulled from the row.

## Working rules
- Every number in the UI links back to a source row/link. No unsourced prices.
- When two sources disagree, keep both values in `notes` and pick the more recent (report §6c–6e > §6 > dashboard).
- Keep `properties.json` diff-able; sort by `id`.
- Don't build auth, accounts, or a database. Sheet is the DB.
