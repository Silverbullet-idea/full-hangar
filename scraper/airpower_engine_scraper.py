"""
scraper/airpower_engine_scraper.py

Scrapes engine overhaul pricing from AirPower Inc. (airpowerinc.com).
Stores exchange price, core charge, and retail price per engine model
in the engine_overhaul_pricing Supabase table.

Usage:
  .venv312\\Scripts\\python.exe scraper\\airpower_engine_scraper.py
  .venv312\\Scripts\\python.exe scraper\\airpower_engine_scraper.py --dry-run
  .venv312\\Scripts\\python.exe scraper\\airpower_engine_scraper.py --limit 10
  .venv312\\Scripts\\python.exe scraper\\airpower_engine_scraper.py --manufacturer Lycoming
  .venv312\\Scripts\\python.exe scraper\\airpower_engine_scraper.py --url https://www.airpowerinc.com/enpl-10077
"""

from __future__ import annotations

import argparse
import asyncio
import html
import random
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    from env_check import env_check
    from scraper_base import get_supabase, setup_logging
except ImportError:  # pragma: no cover
    from .env_check import env_check
    from .scraper_base import get_supabase, setup_logging


BASE_URL = "https://www.airpowerinc.com"
USER_AGENT = "Mozilla/5.0 (compatible; FullHangarAirPowerBot/1.0)"
ENGINE_MODEL_RE = re.compile(r"\b(?:IO|O|TSIO|GTSIO|TIO|HIO|AEIO|LIO|GO|GSO|IGSO)-\d{3,4}[A-Z0-9\-]*", re.I)
HP_RE = re.compile(r"\b(?:rated\s+at\s+)?(\d{2,4})\s*hp\b", re.I)
MONEY_RE = re.compile(r"\$?\s*([\d,]+(?:\.\d{2})?)")

CONTINENTAL_CATEGORIES = [
    "https://www.airpowerinc.com/200-series",
    "https://www.airpowerinc.com/300-series",
    "https://www.airpowerinc.com/360-series",
    "https://www.airpowerinc.com/470-series",
    "https://www.airpowerinc.com/500-series",
    "https://www.airpowerinc.com/gtsio-series",
]

LYCOMING_CATEGORIES = [
    "https://www.airpowerinc.com/235-series",
    "https://www.airpowerinc.com/320-series-lycoming",
    "https://www.airpowerinc.com/360-series-lycoming",
    "https://www.airpowerinc.com/390-series",
    "https://www.airpowerinc.com/540-series",
    "https://www.airpowerinc.com/580-series",
    "https://www.airpowerinc.com/720-series",
]


def parse_money(value: str | None) -> float | None:
    if not value:
        return None
    match = MONEY_RE.search(str(value))
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def detect_manufacturer(engine_model: str, context_text: str | None = None) -> str:
    """
    Determine manufacturer from engine model string.
    """
    series_match = re.search(r"-(\d{3})", engine_model or "")
    if not series_match:
        context = (context_text or "").lower()
        if "lycoming" in context:
            return "Lycoming"
        if "continental" in context:
            return "Continental"
        return "Unknown"

    series = int(series_match.group(1))
    if series in {235, 390, 540, 580, 720}:
        return "Lycoming"
    if series in {200, 240, 470, 520, 550}:
        return "Continental"

    upper_model = (engine_model or "").upper()
    if upper_model.startswith(("TSIO-", "GTSIO-", "GTSI-")):
        return "Continental"
    if upper_model.startswith(("TIO-", "AEIO-", "HIO-", "LIO-")):
        return "Lycoming"

    context = (context_text or "").lower()
    if "lycoming" in context:
        return "Lycoming"
    if "continental" in context:
        return "Continental"
    return "Unknown"


def normalize_engine_model(engine_model: str) -> str:
    """
    Normalize engine model for TBO lookup.
    """
    model = (engine_model or "").strip().upper()
    m = re.match(r"^([A-Z]+-\d+)(?:-([A-Z])\w*)?", model)
    if m:
        base = m.group(1)
        variant_letter = m.group(2)
        if variant_letter:
            return f"{base}-{variant_letter}"
        return base
    return model


def extract_engine_family(engine_model: str) -> str:
    """
    Extract engine family for grouping.
    """
    model = (engine_model or "").strip().upper()
    m = re.match(r"^([A-Z]+-\d+)", model)
    return m.group(1) if m else model


def reconstruct_from_view_source(soup: BeautifulSoup) -> str | None:
    """
    If soup has >100 td.line-content elements, join their text to recover actual HTML.
    Otherwise return None (not view-source format).
    """
    line_cells = soup.select("td.line-content")
    if len(line_cells) <= 100:
        return None
    reconstructed_lines = [html.unescape(cell.get_text("", strip=False)) for cell in line_cells]
    return "\n".join(reconstructed_lines)


def detect_format_and_parse(raw_html: str) -> BeautifulSoup:
    """
    Handles both view-source and live formats.
    Returns a soup of the actual page HTML.
    """
    first_pass = BeautifulSoup(raw_html, "html.parser")
    reconstructed = reconstruct_from_view_source(first_pass)
    if reconstructed:
        return BeautifulSoup(reconstructed, "html.parser")
    return first_pass


def extract_product_detail(soup: BeautifulSoup, source_url: str) -> dict[str, Any] | None:
    """
    Extract product detail payload from a product page.
    """
    h1 = soup.select_one("h1")
    h1_text = re.sub(r"\s+", " ", h1.get_text(" ", strip=True) if h1 else "").strip()
    if not h1_text:
        return None

    sku_node = soup.select_one('span[itemprop="sku"], span.sku')
    product_sku = re.sub(r"\s+", " ", sku_node.get_text(" ", strip=True)).strip() if sku_node else None
    if not product_sku:
        sku_match = re.match(r"^([A-Z]{3,}-\d{3,})\b", h1_text, flags=re.I)
        product_sku = sku_match.group(1).upper() if sku_match else None

    product_name = h1_text
    if product_sku:
        product_name = re.sub(rf"^\s*{re.escape(product_sku)}\s*", "", product_name, flags=re.I).strip()
    product_name = product_name or h1_text

    short_node = soup.select_one(".short-description")
    short_description = re.sub(r"\s+", " ", short_node.get_text(" ", strip=True)).strip() if short_node else None

    text_for_model = " ".join([product_name or "", short_description or "", h1_text]).strip()
    model_match = ENGINE_MODEL_RE.search(text_for_model)
    if not model_match:
        return None
    engine_model = model_match.group(0).upper()

    manufacturer = detect_manufacturer(engine_model, context_text=text_for_model)
    engine_model_normalized = normalize_engine_model(engine_model)
    engine_family = extract_engine_family(engine_model)

    hp_match = HP_RE.search(text_for_model)
    horsepower = int(hp_match.group(1)) if hp_match else None

    exchange_node = soup.select_one('span[id^="user-price-"]')
    core_node = soup.select_one('span[id^="core-charge-"]')
    retail_node = soup.select_one('span[id^="price-value-"]')
    exchange_price = parse_money(exchange_node.get_text(" ", strip=True) if exchange_node else None)
    core_charge = parse_money(core_node.get_text(" ", strip=True) if core_node else None)
    retail_price = parse_money(retail_node.get_text(" ", strip=True) if retail_node else None)
    if exchange_price is None and core_charge is None and retail_price is None:
        # Fallback for model pages that render option-card prices without user-price/core-charge ids.
        option_prices = [
            parse_money(node.get_text(" ", strip=True))
            for node in soup.select("span.price.actual-price, .box-prices-wrapper .price")
        ]
        option_prices = [p for p in option_prices if p is not None and p > 0]
        if option_prices:
            exchange_price = min(option_prices)
            retail_price = max(option_prices) if len(option_prices) > 1 else option_prices[0]

    record: dict[str, Any] = {
        "manufacturer": manufacturer,
        "engine_model": engine_model,
        "engine_model_normalized": engine_model_normalized,
        "engine_family": engine_family,
        "horsepower": horsepower,
        "product_type": "exchange",
        "product_sku": product_sku,
        "product_name": product_name,
        "short_description": short_description,
        "exchange_price": exchange_price,
        "core_charge": core_charge,
        "retail_price": retail_price,
        "source": "airpower",
        "source_url": source_url,
    }
    return record


async def _scrape_category_page_with_playwright_async(url: str) -> list[str]:
    from playwright.async_api import async_playwright

    links: set[str] = set()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if not response or response.status == 404:
                return []
            try:
                await page.wait_for_selector(".product-item", timeout=15000)
            except Exception:
                pass
            await page.wait_for_timeout(1200)
            html_content = await page.content()
        finally:
            await context.close()
            await browser.close()

    soup = BeautifulSoup(html_content, "html.parser")
    for node in soup.select(".product-item a[href], a.product-item-link[href], a[href*='/enpl-']"):
        href = node.get("href")
        if not href:
            continue
        absolute = urljoin(BASE_URL, href)
        parsed = urlparse(absolute)
        if parsed.netloc and "airpowerinc.com" not in parsed.netloc:
            continue
        if "/enpl-" in parsed.path.lower() or re.search(r"/[a-z]{3,}-\d{3,}", parsed.path.lower()):
            links.add(absolute)
    return sorted(links)


def scrape_category_page_with_playwright(url: str) -> list[str]:
    """
    Use Playwright to render a category page and extract product detail URLs.
    """
    return asyncio.run(_scrape_category_page_with_playwright_async(url))


def scrape_product_detail(url: str, session: requests.Session) -> dict[str, Any] | None:
    """
    Use requests for detail pages and parse record.
    """
    try:
        resp = session.get(url, timeout=35)
    except Exception:
        return None
    if resp.status_code != 200:
        return None
    soup = detect_format_and_parse(resp.text)
    record = extract_product_detail(soup, source_url=url)
    time.sleep(random.uniform(2.0, 4.0))
    return record


def upsert_pricing_record(record: dict[str, Any], supabase_client: Any, log) -> None:
    """
    Upsert into engine_overhaul_pricing using (engine_model, source) as conflict key.
    """
    payload = dict(record)
    try:
        supabase_client.table("engine_overhaul_pricing").upsert(payload, on_conflict="engine_model,source").execute()
    except Exception as exc:
        # Some environments reject ON CONFLICT targets even when logically unique.
        if "42P10" not in str(exc):
            raise
        existing = (
            supabase_client.table("engine_overhaul_pricing")
            .select("id")
            .eq("engine_model", payload.get("engine_model"))
            .eq("source", payload.get("source"))
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            supabase_client.table("engine_overhaul_pricing").update(payload).eq("id", existing[0]["id"]).execute()
        else:
            supabase_client.table("engine_overhaul_pricing").insert(payload).execute()
    log.info(
        "Upserted: %s %s @ $%s exchange",
        payload.get("manufacturer"),
        payload.get("engine_model"),
        f"{(payload.get('exchange_price') or 0):,.0f}",
    )


def discover_series_urls(session: requests.Session, log) -> list[str]:
    sitemap_url = f"{BASE_URL}/sitemap"
    try:
        resp = session.get(sitemap_url, timeout=35)
    except Exception as exc:
        log.warning("Could not fetch sitemap: %s", exc)
        return []
    if resp.status_code != 200:
        log.warning("Sitemap request returned %s", resp.status_code)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    urls: set[str] = set()
    for a in soup.select("a[href]"):
        href = a.get("href") or ""
        absolute = urljoin(BASE_URL, href)
        path = urlparse(absolute).path.lower()
        if "series" in path:
            urls.add(absolute)
    return sorted(urls)


def resolve_category_urls(session: requests.Session, seed_urls: list[str], log) -> list[str]:
    discovered = discover_series_urls(session, log)
    resolved: list[str] = []
    discovered_lower = {u.lower(): u for u in discovered}

    for url in seed_urls:
        try:
            resp = session.get(url, timeout=25, allow_redirects=True)
            if resp.status_code != 404:
                resolved.append(url)
                continue
            log.warning("Category 404: %s", url)
        except Exception as exc:
            log.warning("Category pre-check failed for %s: %s", url, exc)
            resolved.append(url)
            continue

        slug = urlparse(url).path.strip("/").lower()
        replacement = discovered_lower.get(url.lower())
        if not replacement:
            replacement = next((u for u in discovered if slug and slug.split("-")[0] in u.lower()), None)
        if replacement:
            log.warning("Replacing category URL %s -> %s", url, replacement)
            resolved.append(replacement)
        else:
            resolved.append(url)

    return resolved


def is_engine_record(record: dict[str, Any]) -> bool:
    model = (record.get("engine_model") or "").upper()
    exchange_price = record.get("exchange_price") or 0
    return bool(ENGINE_MODEL_RE.search(model)) and float(exchange_price) > 5000.0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scrape AirPower engine overhaul pricing")
    parser.add_argument("--dry-run", action="store_true", help="Print parsed records without DB writes")
    parser.add_argument("--limit", type=int, default=None, help="Max number of product URLs to process")
    parser.add_argument("--manufacturer", choices=["Lycoming", "Continental"], default=None)
    parser.add_argument("--url", type=str, default=None, help="Scrape one product URL directly")
    parser.add_argument("--verbose", action="store_true")
    return parser


def main(args) -> int:
    log = setup_logging(verbose=bool(args.verbose))
    if not args.dry_run:
        env_check()
    load_dotenv()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    supabase = None if args.dry_run else get_supabase()

    if args.url:
        record = scrape_product_detail(args.url, session)
        if not record or not is_engine_record(record):
            log.warning("No valid engine record parsed from %s", args.url)
            return 1
        if args.manufacturer and record.get("manufacturer") != args.manufacturer:
            log.warning("Record manufacturer %s did not match filter %s", record.get("manufacturer"), args.manufacturer)
            return 1
        if args.dry_run:
            log.info("[dry-run] %s", record)
        else:
            upsert_pricing_record(record, supabase, log)
        return 0

    category_urls = CONTINENTAL_CATEGORIES + LYCOMING_CATEGORIES
    category_urls = resolve_category_urls(session, category_urls, log)

    all_product_urls: set[str] = set()
    categories_scraped = 0
    for category_url in category_urls:
        categories_scraped += 1
        urls = scrape_category_page_with_playwright(category_url)
        if not urls:
            log.warning("No product URLs found on category: %s", category_url)
        all_product_urls.update(urls)
        time.sleep(random.uniform(3.0, 6.0))

    product_urls = sorted(all_product_urls)
    if args.limit is not None:
        product_urls = product_urls[: max(0, args.limit)]

    upserted = 0
    scanned = 0
    for product_url in product_urls:
        scanned += 1
        record = scrape_product_detail(product_url, session)
        if not record or not is_engine_record(record):
            continue
        if args.manufacturer and record.get("manufacturer") != args.manufacturer:
            continue
        if args.dry_run:
            log.info("[dry-run] %s", record)
            upserted += 1
            continue
        try:
            upsert_pricing_record(record, supabase, log)
            upserted += 1
        except Exception as exc:
            log.warning("Upsert failed for %s: %s", product_url, exc)

    log.info(
        "Summary: scraped %s categories, found %s product URLs, processed %s URLs, upserted %s engine records",
        categories_scraped,
        len(all_product_urls),
        scanned,
        upserted,
    )
    return 0


if __name__ == "__main__":
    parser = build_arg_parser()
    raise SystemExit(main(parser.parse_args()))
