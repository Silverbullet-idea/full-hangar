"""
Controller.com listing HTML helpers (no scraper pipeline imports).

Used by controller_scraper for detail price + tested via saved HTML fixtures.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

log = logging.getLogger(__name__)

try:
    from scraper_health import SelectorConfig
except ImportError:  # pragma: no cover
    from .scraper_health import SelectorConfig

CONTROLLER_JSON_MIN_PRICE = 1000

CONTROLLER_DETAIL_PRICE_SELECTOR = SelectorConfig(
    name="controller_detail_price",
    primary="strong.listing-prices__retail-price",
    fallbacks=[
        ".listing-prices__retail-price",
        "div.listing-prices__retail strong",
    ],
)


def parse_listing_price_text(price_text: str) -> Optional[int]:
    numeric = re.sub(r"[^\d]", "", price_text or "")
    if not numeric:
        return None
    try:
        return int(numeric)
    except ValueError:
        return None


def extract_controller_listing_price_from_json(html: str) -> Optional[int]:
    """
    Sandhills JSON on listing pages includes RetailPrice / Price (e.g. \"USD $465,000\").
    """
    if not html:
        return None
    for pattern in (
        r'"RetailPrice"\s*:\s*"([^"]*)"',
        r'"Price"\s*:\s*"(USD[^"]*)"',
    ):
        for m in re.finditer(pattern, html):
            raw = (m.group(1) or "").strip()
            if not raw or "call" in raw.lower():
                continue
            p = parse_listing_price_text(raw)
            if p is not None and p >= CONTROLLER_JSON_MIN_PRICE:
                return p
    return None


def maybe_log_list_detail_price_divergence(
    *,
    list_price: Optional[int],
    detail_price: Optional[int],
    source_id: str,
    context_label: str,
) -> None:
    """Warn when search-card price and detail price disagree materially."""
    if list_price is None or detail_price is None:
        return
    if list_price == detail_price:
        return
    diff = abs(list_price - detail_price)
    denom = max(list_price, detail_price)
    if diff < max(5000, int(0.02 * denom)):
        return
    log.warning(
        "[controller] list vs detail price mismatch list=%s detail=%s source_id=%s (%s)",
        list_price,
        detail_price,
        source_id,
        context_label,
    )
