from __future__ import annotations

"""
Integration test for the TAP auto scraper stack.
Tests: cookie loading, block detection, parser extraction, upsert pipeline.

Run: .venv312\\Scripts\\python.exe scraper\\test_tap_auto.py
"""

from pathlib import Path

from bs4 import BeautifulSoup

from tap_cookie_manager import CookieManager
from tap_parser import parse_detail_page, parse_list_card
from tap_session_manager import TAPSessionManager


def test_cookie_loading():
    """Load tap_cookies.json and verify DataDome cookie is present."""
    manager = CookieManager("scraper/tap_cookies.json")
    pw_cookies = manager.load_cookies()
    dd_cookie = next((c for c in pw_cookies if c["name"] == "datadome"), None)
    assert dd_cookie is not None, "DataDome cookie not found in tap_cookies.json"
    assert dd_cookie["value"], "DataDome cookie value is empty"
    print(f"OK Cookie loading: DataDome cookie present, age={manager.get_datadome_age_hours():.1f}h")


def test_block_detection():
    """Test block page detection from sample files."""
    sample = Path("scraper/state/tap_probe_good.html")
    if not sample.exists():
        print("SKIP: tap_probe_good.html not in scraper/state/ — copy from project uploads")
        return
    good_html = sample.read_text(encoding="utf-8", errors="ignore")
    manager = TAPSessionManager()
    assert not manager._is_blocked(good_html, 200), "Good page incorrectly flagged as blocked"
    print("OK Block detection: good page correctly passes")


def test_card_parser():
    """Parse cards from tap_block_sample.html (which is actually a good list page)."""
    sample = Path("scraper/state/tap_block_sample.html")
    if not sample.exists():
        print("SKIP: tap_block_sample.html not in scraper/state/ — copy from project uploads")
        return
    html = sample.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.result_listing")
    assert len(cards) >= 20, f"Expected 20+ cards, got {len(cards)}"
    first = parse_list_card(cards[0])
    assert first is not None
    assert first.get("source_id"), "source_id missing"
    assert first.get("price_asking"), "price_asking missing"
    print(f"OK Card parser: {len(cards)} cards, first={first.get('title')} ${first.get('price_asking')}")


def test_detail_parser():
    """Parse detail from tap_probe_good.html (2022 Diamond DA62)."""
    sample = Path("scraper/state/tap_probe_good.html")
    if not sample.exists():
        print("SKIP: tap_probe_good.html not in scraper/state/ — copy from project uploads")
        return
    html = sample.read_text(encoding="utf-8", errors="ignore")
    detail = parse_detail_page(
        html,
        "tap_2451580",
        "https://www.trade-a-plane.com/search?listing_id=2451580&s-type=aircraft",
    )
    assert detail.get("year") == 2022, f"year wrong: {detail.get('year')}"
    assert detail.get("price_asking") == 550000, f"price wrong: {detail.get('price_asking')}"
    assert detail.get("total_time_airframe") == 428, f"TT wrong: {detail.get('total_time_airframe')}"
    assert detail.get("engine_time_since_overhaul") == 428
    assert detail.get("n_number") == "N462D", f"N-number wrong: {detail.get('n_number')}"
    print(
        f"OK Detail parser: year={detail['year']} price={detail['price_asking']} TT={detail['total_time_airframe']} n={detail['n_number']}"
    )


def test_twin_engine_parser():
    """Parse twin engine from tap_prope_twin.html (2018 Diamond DA62)."""
    sample = Path("scraper/state/tap_prope_twin.html")
    if not sample.exists():
        print("SKIP: tap_prope_twin.html not in scraper/state/ — copy from project uploads")
        return
    html = sample.read_text(encoding="utf-8", errors="ignore")
    detail = parse_detail_page(
        html,
        "tap_2444404",
        "https://www.trade-a-plane.com/search?listing_id=2444404&s-type=aircraft",
    )
    assert detail.get("engine_count") == 2, f"engine_count wrong: {detail.get('engine_count')}"
    assert detail.get("total_time_airframe") == 850
    assert detail.get("time_since_prop_overhaul") == 850
    assert detail.get("second_engine_time_since_overhaul") == 850
    assert detail.get("n_number") == "N520RA"
    assert "Garmin" in (detail.get("avionics_description") or ""), "Avionics not extracted"
    print(
        f"OK Twin engine: engines={detail['engine_count']} TT={detail['total_time_airframe']} avionics={bool(detail.get('avionics_description'))}"
    )


if __name__ == "__main__":
    test_cookie_loading()
    test_block_detection()
    test_card_parser()
    test_detail_parser()
    test_twin_engine_parser()
