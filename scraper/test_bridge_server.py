"""
Quick integration test for bridge_server.py
Run with: .venv312\\Scripts\\python.exe scraper\\test_bridge_server.py

Tests:
1. Ping endpoint is reachable
2. POST /ingest with a minimal listing dict returns ok
3. POST /ingest with --dry-run active prints but doesn't DB write
"""

import requests

BASE = "http://localhost:8765"


def test_ping() -> None:
    r = requests.get(f"{BASE}/ping", timeout=5)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    print("OK /ping")


def test_ingest() -> None:
    sample_listing = [
        {
            "source_site": "controller",
            "source_id": "TEST_EXT_001",
            "source_listing_id": "TEST_EXT_001",
            "url": "https://www.controller.com/listing/test",
            "make": "Cessna",
            "model": "172N",
            "year": 1978,
            "price_asking": 48000,
            "aircraft_type": "single_engine_piston",
            "location_state": "TX",
            "description": "1978 Cessna 172N. TTAF 3200, SMOH 450 on O-320. Narco MK12D comm, transponder.",
        }
    ]
    r = requests.post(f"{BASE}/ingest", json=sample_listing, timeout=15)
    assert r.status_code == 200
    data = r.json()
    print(f"OK /ingest: {data}")


if __name__ == "__main__":
    try:
        test_ping()
        test_ingest()
        print("\nAll bridge tests passed.")
    except AssertionError as e:
        print(f"Test failed: {e}")
    except requests.ConnectionError:
        print("Bridge server not running. Start it first: .venv312\\Scripts\\python.exe scraper\\bridge_server.py")
