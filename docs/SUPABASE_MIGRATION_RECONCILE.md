# Supabase migration reconcile (local vs remote)

Use this after pulling main or before production pushes.

1. **Link CLI** (once per machine): `npx supabase link --project-ref <your-ref>`  
2. **List remote history**: `npx supabase migration list`  
3. **Compare** filenames under `supabase/migrations/` with the remote table; any timestamp present locally but not on remote must be applied in order.  
4. **Apply**: `npx supabase db push` (never use a global `supabase` binary; use `npx supabase`).  
5. **Engine-value chain** (if migrating an older project): see `docs/ENGINE_VALUE_MIGRATIONS.md` for ordering notes around `ev_*` / `public_listings`.

After new migrations land, run a small backfill smoke test:

```powershell
.venv312\Scripts\python.exe scraper\backfill_scores.py --limit 5 --dry-run
```
