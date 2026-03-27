# Data source research backlog (DS-4 / DS-6–DS-9)

Actionable research tracks from `AGENTS.md`. Each row should end with a short decision memo (scrape vs API vs defer) and owner/date.

| ID | Topic | Goal | Status |
|----|--------|------|--------|
| DS-4 | Type clubs | Matrix of clubs, terms of use, scrape/API feasibility | Open — research + allowed scrapers only |
| DS-6 | Bluebook | Integration plan + ROI vs current comps stack | Open — plan only |
| DS-7 | VREF | Integration plan + matrix vs Bluebook | Open — plan only |
| DS-8 | State tax / registration | Viable public portals for normalized ingest | Open — research |
| DS-9 | YouTube | Transcript-mining POC + confidence-labeled sample | Open — prototype |

## Suggested deliverables

- **DS-4:** `docs/ds-4-type-clubs-matrix.md` (sources, robots/TOS, fields, refresh cadence).
- **DS-6 / DS-7:** single comparison doc with cost, licensing, coverage, and overlap with listing + sold comps.
- **DS-8:** state-by-state portal list + normalization rules (jurisdiction code, rate type).
- **DS-9:** one pipeline script + 20–50 annotated examples with precision/recall notes.

## Next actions (pick one track per session)

1. **DS-4 — Type clubs:** List 10–15 high-signal clubs (COPA, ABS, Mooney, etc.); for each capture public URL, registration/login requirement, robots.txt summary, and whether aircraft listing or “for sale” pages exist. Output: one table in `docs/ds-4-type-clubs-matrix.md`.
2. **DS-6 / DS-7 — Paid guides:** Obtain trial or public marketing PDFs for Bluebook vs VREF; document data fields offered (airframe, engine, avionics), update cadence, API availability, and estimated annual cost. Decision output: “integrate / wait / never” with one paragraph of rationale vs current `market_comps` + listing comps.
3. **DS-8 — Taxes:** For CA, TX, FL, NY, OH (pilot set): identify state revenue / aviation agency pages for sales/use tax or registration fees; note scrape vs manual CSV. Output: `docs/ds-8-state-tax-portals.md` with URL + refresh suggestion.
4. **DS-9 — YouTube:** Choose 15 listing-style walkaround videos; pull transcripts (YouTube API or manual); label each line as factual airframe claim vs opinion; note confidence. Output: `docs/ds-9-youtube-poc-sample.md` + optional `scraper/youtube_transcript_probe.py` stub when API key is available.

## Dependency / risk notes

- **DS-4 / DS-9:** Legal/TOS and rate limits — prefer official APIs or explicit permission over aggressive scraping.
- **DS-6 / DS-7:** Licensing may forbid storage of guide values in DB; plan may be “human-in-the-loop comparison only.”
- **DS-8:** Jurisdiction and aircraft-type rules vary; normalize on `registration_state` + `aircraft_category` keys used in `public_listings`.
