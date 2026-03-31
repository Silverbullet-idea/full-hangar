"""
scraper_health.py — Self-healing infrastructure for FullHangar scrapers.

Drop into scraper/ directory. Import in any scraper:
    from scraper_health import (
        log_scraper_error, retry_with_backoff, health_check,
        looks_like_challenge_html, ScraperResult
    )

Usage:
    python scraper/scraper_health.py --check      # run daily health check
    python scraper/scraper_health.py --summary    # print error summary
"""

from __future__ import annotations

import argparse
import functools
import logging
import time
import traceback
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Callable, ClassVar, TypeVar

log = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


# ---------------------------------------------------------------------------
# Challenge / bot-wall detection
# ---------------------------------------------------------------------------

CHALLENGE_MARKERS = (
    "geo.captcha-delivery.com",
    "ct.captcha-delivery.com",
    "please enable js and disable any ad blocker",
    "var dd=",
    "datadome",
    "captcha-delivery",
    "cf-browser-verification",
    "challenge-form",
    "__cf_chl",
    "ray id",
    "perimeterx",
    "_px3",
    "incapsula",
    "visitorid",
    "human verification",
    "bot detection",
    "access denied",
    "403 forbidden",
    "you have been blocked",
)


def looks_like_challenge_html(html: str) -> bool:
    """Return True if the page looks like a bot challenge / block page."""
    low = str(html or "").lower()
    return any(marker in low for marker in CHALLENGE_MARKERS)


def detect_challenge_type(html: str) -> str | None:
    """Return a string label for the challenge type, or None if clean."""
    low = str(html or "").lower()
    if "datadome" in low or "captcha-delivery" in low:
        return "datadome"
    if "__cf_chl" in low or "cf-browser-verification" in low or "ray id" in low:
        return "cloudflare"
    if "perimeterx" in low or "_px3" in low:
        return "perimeterx"
    if "incapsula" in low:
        return "incapsula"
    if "access denied" in low or "you have been blocked" in low:
        return "generic_block"
    return None


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------

class ErrorType(str, Enum):
    CHALLENGE = "challenge"
    SELECTOR_MISS = "selector_miss"
    NETWORK = "network"
    PARSE = "parse"
    RATE_LIMIT = "rate_limit"
    AUTH = "auth"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# ScraperResult — standardized return from any scraper run
# ---------------------------------------------------------------------------

@dataclass
class ScraperResult:
    source_site: str
    rows_scraped: int = 0
    rows_upserted: int = 0
    rows_skipped: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)
    challenge_hits: int = 0
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finished_at: str | None = None

    def finish(self) -> "ScraperResult":
        self.finished_at = datetime.now(timezone.utc).isoformat()
        return self

    def add_error(self, url: str, error_type: ErrorType, raw_error: str) -> None:
        self.errors.append({
            "url": url,
            "error_type": error_type.value,
            "raw_error": raw_error[:2000],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    def summary(self) -> str:
        return (
            f"[{self.source_site}] scraped={self.rows_scraped} "
            f"upserted={self.rows_upserted} skipped={self.rows_skipped} "
            f"errors={len(self.errors)} challenges={self.challenge_hits}"
        )


# ---------------------------------------------------------------------------
# DB error logging
# ---------------------------------------------------------------------------

def log_scraper_error(
    supabase: Any,
    *,
    source_site: str,
    error_type: ErrorType,
    url: str,
    raw_error: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """
    Write an error row to the scraper_errors table.
    
    Create this table in Supabase if it does not exist:
    
        CREATE TABLE IF NOT EXISTS scraper_errors (
            id          bigserial PRIMARY KEY,
            source_site text      NOT NULL,
            error_type  text      NOT NULL,
            url         text,
            raw_error   text,
            extra       jsonb,
            resolved    boolean   DEFAULT false,
            created_at  timestamptz DEFAULT now()
        );
    """
    try:
        row: dict[str, Any] = {
            "source_site": source_site,
            "error_type": error_type.value,
            "url": str(url or "")[:2000],
            "raw_error": str(raw_error or "")[:5000],
            "resolved": False,
        }
        if extra:
            row["extra"] = extra
        supabase.table("scraper_errors").insert(row).execute()
    except Exception as exc:
        log.warning("Failed to log scraper error to DB: %s", exc)


# ---------------------------------------------------------------------------
# Retry decorator with exponential backoff
# ---------------------------------------------------------------------------

def retry_with_backoff(
    max_attempts: int = 3,
    base_delay: float = 5.0,
    backoff_factor: float = 2.0,
    exceptions: tuple[type[Exception], ...] = (Exception,),
    skip_on_challenge: bool = True,
) -> Callable[[F], F]:
    """
    Decorator: retry a function up to max_attempts times with exponential backoff.
    
    On challenge detection (if the function raises with 'challenge' in the message
    or if skip_on_challenge is True and the result smells like a block page),
    do NOT retry — log and move on.

    Usage:
        @retry_with_backoff(max_attempts=3, base_delay=5.0)
        def fetch_listing(url: str) -> dict:
            ...
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    msg = str(exc).lower()
                    if skip_on_challenge and any(
                        m in msg for m in ("challenge", "captcha", "datadome", "cloudflare", "blocked")
                    ):
                        log.warning(
                            "[retry] challenge detected in exception for %s — skipping retries: %s",
                            func.__name__, exc,
                        )
                        raise
                    if attempt < max_attempts:
                        delay = base_delay * (backoff_factor ** (attempt - 1))
                        log.warning(
                            "[retry] attempt %s/%s failed for %s: %s. Retrying in %.1fs",
                            attempt, max_attempts, func.__name__, exc, delay,
                        )
                        time.sleep(delay)
                    else:
                        log.error(
                            "[retry] all %s attempts failed for %s: %s",
                            max_attempts, func.__name__, exc,
                        )
            if last_exc is not None:
                raise last_exc
        return wrapper  # type: ignore[return-value]
    return decorator


# ---------------------------------------------------------------------------
# Selector versioning helpers
# ---------------------------------------------------------------------------

@dataclass
class SelectorConfig:
    """
    Versioned CSS selectors for a scraper.
    
    Primary selector is tried first. If it returns no results,
    fallbacks are tried in order. The working selector is logged.
    
    Usage:
        PRICE_SELECTOR = SelectorConfig(
            name="price",
            primary=".listing-price .amount",
            fallbacks=[".price-tag", "[data-price]", ".asking-price"],
        )
        price_el = PRICE_SELECTOR.find(soup)
    """
    name: str
    primary: str
    fallbacks: list[str] = field(default_factory=list)

    _find_counts: ClassVar[dict[str, Counter[str]]] = defaultdict(Counter)

    @classmethod
    def reset_find_counts(cls) -> None:
        cls._find_counts.clear()

    @classmethod
    def snapshot_find_counts(cls) -> dict[str, dict[str, int]]:
        return {name: dict(counts) for name, counts in cls._find_counts.items()}

    def find(self, soup: Any) -> Any:
        from bs4 import BeautifulSoup  # local import — bs4 may not be installed everywhere
        result = soup.select_one(self.primary)
        if result is not None:
            type(self)._find_counts[self.name]["primary"] += 1
            return result
        for i, fb in enumerate(self.fallbacks):
            result = soup.select_one(fb)
            if result is not None:
                type(self)._find_counts[self.name][f"fallback_{i}"] += 1
                log.warning(
                    "[selector-fallback] %s: primary '%s' missed, used fallback '%s'",
                    self.name, self.primary, fb,
                )
                return result
        type(self)._find_counts[self.name]["miss"] += 1
        log.error("[selector-miss] %s: all selectors failed. Primary: '%s'", self.name, self.primary)
        return None

    def find_all(self, soup: Any) -> list[Any]:
        results = soup.select(self.primary)
        if results:
            type(self)._find_counts[self.name]["primary_all"] += 1
            return results
        for i, fb in enumerate(self.fallbacks):
            results = soup.select(fb)
            if results:
                type(self)._find_counts[self.name][f"fallback_all_{i}"] += 1
                log.warning(
                    "[selector-fallback] %s: primary '%s' missed, used fallback '%s'",
                    self.name, self.primary, fb,
                )
                return results
        type(self)._find_counts[self.name]["miss_all"] += 1
        log.error("[selector-miss] %s: all selectors returned empty. Primary: '%s'", self.name, self.primary)
        return []


# ---------------------------------------------------------------------------
# Daily health check
# ---------------------------------------------------------------------------

def run_health_check(supabase: Any, *, drop_threshold_pct: float = 0.20) -> dict[str, Any]:
    """
    Compare today's active listing counts vs yesterday's per source_site.
    Returns a report dict. Logs warnings for any source that dropped >threshold.
    
    Call this after each scraper run, or schedule daily.
    """
    today = date.today().isoformat()
    try:
        rows = (
            supabase.table("aircraft_listings")
            .select("source_site, is_active, last_seen_date")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        log.error("Health check DB query failed: %s", exc)
        return {"error": str(exc)}

    from collections import defaultdict
    today_counts: dict[str, int] = defaultdict(int)
    yesterday_counts: dict[str, int] = defaultdict(int)

    for row in rows:
        site = str(row.get("source_site") or "unknown")
        seen = str(row.get("last_seen_date") or "")
        active = row.get("is_active", False)
        if not active:
            continue
        if seen == today:
            today_counts[site] += 1
        elif seen < today:
            yesterday_counts[site] += 1

    all_sites = set(today_counts) | set(yesterday_counts)
    report: dict[str, Any] = {"checked_at": today, "sites": {}}

    for site in sorted(all_sites):
        tc = today_counts.get(site, 0)
        yc = yesterday_counts.get(site, 0)
        if yc > 0:
            change_pct = (tc - yc) / yc
        else:
            change_pct = 0.0
        alert = change_pct < -drop_threshold_pct and yc > 10
        report["sites"][site] = {
            "today": tc,
            "yesterday": yc,
            "change_pct": round(change_pct * 100, 1),
            "alert": alert,
        }
        if alert:
            log.warning(
                "[health-check] ALERT: %s dropped %.1f%% (yesterday=%s today=%s)",
                site, abs(change_pct * 100), yc, tc,
            )
        else:
            log.info("[health-check] %s: today=%s yesterday=%s (%.1f%%)", site, tc, yc, change_pct * 100)

    return report


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="FullHangar scraper health tools")
    parser.add_argument("--check", action="store_true", help="Run daily health check")
    parser.add_argument("--summary", action="store_true", help="Print error summary from scraper_errors table")
    parser.add_argument("--resolve", type=int, default=None, help="Mark scraper_errors row ID as resolved")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    try:
        from scraper_base import get_supabase
    except ImportError:
        from .scraper_base import get_supabase

    supabase = get_supabase()

    if args.check:
        report = run_health_check(supabase)
        import json
        print(json.dumps(report, indent=2))

    if args.summary:
        try:
            rows = (
                supabase.table("scraper_errors")
                .select("source_site, error_type, resolved, created_at, url")
                .eq("resolved", False)
                .order("created_at", desc=True)
                .limit(50)
                .execute()
                .data
                or []
            )
            if not rows:
                print("No unresolved errors.")
            else:
                print(f"Unresolved errors: {len(rows)}")
                for r in rows:
                    print(f"  [{r.get('source_site')}] {r.get('error_type')} | {r.get('url', '')[:60]} | {r.get('created_at', '')[:10]}")
        except Exception as exc:
            print(f"Could not fetch errors (table may not exist yet): {exc}")

    if args.resolve is not None:
        supabase.table("scraper_errors").update({"resolved": True}).eq("id", args.resolve).execute()
        print(f"Marked error ID {args.resolve} as resolved.")


if __name__ == "__main__":
    main()
