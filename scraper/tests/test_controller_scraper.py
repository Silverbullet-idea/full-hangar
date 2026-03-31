from __future__ import annotations

from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from controller_listing_extract import (
    CONTROLLER_DETAIL_PRICE_SELECTOR,
    extract_controller_listing_price_from_json,
    maybe_log_list_detail_price_divergence,
    parse_listing_price_text,
)
from scraper_health import SelectorConfig

_FIXTURE_DIR = Path(__file__).resolve().parent.parent
_FIXTURES = [
    ("controller_listing_Example.html", 465_000),
    ("controller_listing_Example2.html", 1_299_000),
    ("controller_listing_Example3.html", 1_932_093),
]


@pytest.mark.parametrize("filename,expected", _FIXTURES)
def test_controller_embedded_json_price(filename: str, expected: int) -> None:
    html = (_FIXTURE_DIR / filename).read_text(encoding="utf-8", errors="replace")
    assert extract_controller_listing_price_from_json(html) == expected


@pytest.mark.parametrize("filename,expected", _FIXTURES)
def test_controller_detail_dom_price_selector(filename: str, expected: int) -> None:
    html = (_FIXTURE_DIR / filename).read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    SelectorConfig.reset_find_counts()
    el = CONTROLLER_DETAIL_PRICE_SELECTOR.find(soup)
    assert el is not None
    assert parse_listing_price_text(el.get_text(strip=True)) == expected
    snap = SelectorConfig.snapshot_find_counts()
    assert snap["controller_detail_price"].get("primary", 0) >= 1


def test_list_detail_divergence_logs_only_material_gap(caplog: pytest.LogCaptureFixture) -> None:
    import logging

    caplog.set_level(logging.WARNING)
    maybe_log_list_detail_price_divergence(
        list_price=100_000,
        detail_price=101_000,
        source_id="1",
        context_label="test",
    )
    assert not caplog.records
    maybe_log_list_detail_price_divergence(
        list_price=100_000,
        detail_price=200_000,
        source_id="1",
        context_label="test",
    )
    assert caplog.records
