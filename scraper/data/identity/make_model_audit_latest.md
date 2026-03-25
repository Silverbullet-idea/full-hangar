# Make / model quality audit

- Generated: `2026-03-24T16:44:04.651416+00:00`
- Active listings scanned: **10536**
- Distinct make strings: **283**
- Case-collision groups (same make, different casing): **16**
- Curated rule rows (would change): **1528**
- FAA suggestion rows (would change): **1188**

## Curated-rule fixes by source (full row counts)

Every source contributes bad make/model shapes — not just GlobalAir. The section below is the real attribution for **curated** corrections.

- **globalair**: 555
- **controller**: 456
- **avbuyer**: 396
- **aso**: 74
- **aerotrader**: 25
- **trade_a_plane**: 22

## Curated fixes by kind

- `make_display_alias`: 763
- `model_as_make`: 490
- `make_prefix_merge`: 275

## Top curated rules (id / count)

- `alias:BEECHCRAFT`: 238
- `alias:CESSNA`: 197
- `cessna_citation_word`: 152
- `bombardier_family`: 110
- `cessna_citation`: 103
- `alias:CIRRUS AIRCRAFT`: 95
- `dassault_falcon_word`: 78
- `bombardier_learjet_word`: 70
- `dassault_falcon`: 62
- `alias:BELL HELICOPTERS`: 62
- `alias:AIRBUS EUROCOPTER`: 59
- `alias:BEECH`: 49
- `bombardier_challenger_word`: 47
- `beech_bonanza`: 42
- `bombardier_global_word`: 39
- `alias:PIPER`: 30
- `alias:EUROCOPTER`: 27
- `embraer_phenom_word`: 21
- `beech_baron_word`: 11
- `piper_arrow_word`: 7
- `piper_cherokee_word`: 5
- `piper_comanche`: 4
- `piper_archer_word`: 4
- `alias:AIRBUS`: 4
- `piper_cheyenne`: 3

## FAA auto-suggestion fixes by source (rows with US N-number + ACFTREF)

- **avbuyer**: 307
- **trade_a_plane**: 305
- **globalair**: 278
- **controller**: 193
- **aso**: 82
- **aerotrader**: 23

## Digit-only / very short numeric makes → sources

Narrow heuristic (make is all digits, length ≤ 3). Your `505` rows are here; this is **not** the full bad-source picture.

- `505`: {'globalair': 3}
