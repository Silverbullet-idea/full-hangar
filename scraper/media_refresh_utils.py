from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


def load_source_ids_file(path: str | None) -> list[str]:
    if not path:
        return []
    source_file = Path(path)
    if not source_file.exists():
        raise FileNotFoundError(f"Source IDs file not found: {source_file}")
    ids: list[str] = []
    for line in source_file.read_text(encoding="utf-8").splitlines():
        cleaned = line.strip()
        if cleaned:
            ids.append(cleaned)
    return list(dict.fromkeys(ids))


def _parse_image_urls(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except Exception:
                return []
        return [text]
    return []


def gallery_count(row: dict[str, Any]) -> int:
    return len(_parse_image_urls(row.get("image_urls")))


def needs_media_refresh(row: dict[str, Any]) -> bool:
    primary = str(row.get("primary_image_url") or "").strip()
    count = gallery_count(row)
    # Refresh rows with no picture or only one image.
    if not primary and count == 0:
        return True
    return count <= 1


def fetch_refresh_rows(
    supabase: Any,
    *,
    source_site: str,
    source_ids: list[str],
    limit: int | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if source_ids:
        unique_ids = list(dict.fromkeys(source_ids))
        if limit and limit > 0:
            unique_ids = unique_ids[:limit]
        for idx in range(0, len(unique_ids), 200):
            chunk = unique_ids[idx : idx + 200]
            if not chunk:
                continue
            response = (
                supabase.table("aircraft_listings")
                .select("source_id,url,last_seen_date,primary_image_url,image_urls")
                .eq("source_site", source_site)
                .in_("source_id", chunk)
                .execute()
            )
            rows.extend(response.data or [])
        return rows

    batch = 500
    offset = 0
    while True:
        response = (
            supabase.table("aircraft_listings")
            .select("source_id,url,last_seen_date,primary_image_url,image_urls")
            .eq("source_site", source_site)
            .order("source_id")
            .range(offset, offset + batch - 1)
            .execute()
        )
        chunk = response.data or []
        if not chunk:
            break
        for row in chunk:
            if needs_media_refresh(row):
                rows.append(row)
                if limit and limit > 0 and len(rows) >= limit:
                    return rows
        if len(chunk) < batch:
            break
        offset += batch
    return rows


def apply_media_update(
    supabase: Any,
    *,
    source_site: str,
    source_id: str,
    image_urls: list[str],
    primary_image_url: str | None,
) -> None:
    payload = {
        "image_urls": image_urls or None,
        "primary_image_url": primary_image_url or None,
        "last_seen_date": date.today().isoformat(),
        "is_active": True,
        "inactive_date": None,
    }
    (
        supabase.table("aircraft_listings")
        .update(payload)
        .eq("source_site", source_site)
        .eq("source_id", source_id)
        .execute()
    )


def seen_within_hours(last_seen_date: Any, hours: int) -> bool:
    if not last_seen_date:
        return False
    try:
        if isinstance(last_seen_date, str):
            text = last_seen_date.strip()
            if len(text) == 10:
                seen_dt = datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
            else:
                seen_dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
                if seen_dt.tzinfo is None:
                    seen_dt = seen_dt.replace(tzinfo=timezone.utc)
        elif isinstance(last_seen_date, datetime):
            seen_dt = last_seen_date if last_seen_date.tzinfo else last_seen_date.replace(tzinfo=timezone.utc)
        else:
            return False
        return (datetime.now(timezone.utc) - seen_dt).total_seconds() <= hours * 3600
    except Exception:
        return False
