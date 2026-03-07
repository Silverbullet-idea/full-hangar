"""Deterministic tests for avionics intelligence scoring."""

from __future__ import annotations

import core.intelligence.avionics_intelligence as avionics_module
from core.intelligence.avionics_intelligence import avionics_score


def test_glass_with_adsb_and_waas() -> None:
    listing = {
        "avionics_description": "Garmin G1000 integrated panel with ADS-B Out and WAAS upgrade.",
    }
    result = avionics_score(listing)
    assert result["has_glass_cockpit"] is True
    assert result["installed_value"] == 38500
    assert result["score"] == 86.2


def test_alias_matching_without_spaces() -> None:
    listing = {
        "avionics_description": "Panel includes GTN750, GNS530, GTX345 transponder and GFC500 autopilot.",
    }
    result = avionics_score(listing)
    assert result["installed_value"] == 41500
    matched = {item["item"] for item in result["matched_items"]}
    assert "garmin gtns 750" in matched
    assert "garmin gns 530" in matched
    assert "garmin gtx 345" in matched
    assert "garmin gfc 500" in matched


def test_duplicate_glass_systems_count_highest_once() -> None:
    listing = {
        "avionics_description": "Garmin G1000 or Garmin G600 panel option with Aspen Evolution backup.",
    }
    result = avionics_score(listing)
    # Highest-value glass system should be retained, not stacked with alternatives.
    assert result["installed_value"] == 35000
    matched = {item["item"] for item in result["matched_items"]}
    assert "garmin g1000" in matched
    assert "garmin g600" not in matched
    assert "aspen evolution" not in matched


def test_steam_panel_defaults_low() -> None:
    listing = {
        "avionics_description": "Original panel with six pack analog steam gauges.",
    }
    result = avionics_score(listing)
    assert result["installed_value"] == 0
    assert result["is_steam_gauge"] is True
    assert result["score"] == 20


def test_unknown_panel_defaults_mid() -> None:
    listing = {
        "description": "Clean airplane with updated paint and interior only.",
    }
    result = avionics_score(listing)
    assert result["installed_value"] == 0
    assert result["is_steam_gauge"] is False
    assert result["score"] == 40


def test_stc_detection_adds_modification_value() -> None:
    listing = {
        "make": "Cessna",
        "model": "172",
        "description": "Penn Yan Superhawk 180HP with O-360 conversion and constant speed prop upgrade.",
    }
    result = avionics_score(listing)
    assert result["installed_value"] == 0
    assert result["stc_market_value_premium_total"] == 14000
    assert result["total_modification_value"] == 14000
    detected = {item["stc_name"] for item in result["detected_stcs"]}
    assert "Penn Yan 180HP Superhawk" in detected
    assert "Constant Speed Prop Conversion" in detected


def test_market_value_source_breakdown_present() -> None:
    listing = {
        "avionics_description": "GTN750, GNS530, GTX345 and GFC500 stack.",
        "aircraft_type": "single_engine_piston",
    }
    result = avionics_score(listing)
    assert isinstance(result["market_value_source_breakdown"], dict)
    assert result["market_value_source_primary"] in {"oem_msrp", "market_p25", "fallback_static", "none"}
    assert isinstance(result["market_sample_total"], int)


def test_capability_aliases_prefer_oem_seeded_sources(monkeypatch) -> None:
    avionics_module._alias_to_market_value_cache.clear()

    def _fake_alias_market_values(_segment: str) -> dict[str, dict[str, object]]:
        return {
            "waas": {"oem_msrp_value": 1101, "sample_count": 3},
            "ads b out": {"oem_msrp_value": 2601, "sample_count": 3},
            "jpi edm": {"oem_msrp_value": 2401, "sample_count": 3},
        }

    monkeypatch.setattr(
        avionics_module,
        "_get_alias_to_market_value",
        _fake_alias_market_values,
    )

    listing = {
        "avionics_description": "WAAS, ADS-B Out transponder, and JPI EDM installed.",
        "aircraft_type": "single_engine_piston",
    }
    result = avionics_score(listing)
    assert result["installed_value"] == 6103
    assert result["market_value_source_primary"] == "oem_msrp"
    assert result["market_value_source_breakdown"].get("oem_msrp", 0) >= 3
    assert result["market_sample_total"] >= 9


def _run_all_tests() -> int:
    tests = [
        test_glass_with_adsb_and_waas,
        test_alias_matching_without_spaces,
        test_duplicate_glass_systems_count_highest_once,
        test_steam_panel_defaults_low,
        test_unknown_panel_defaults_mid,
        test_stc_detection_adds_modification_value,
        test_market_value_source_breakdown_present,
        test_capability_aliases_prefer_oem_seeded_sources,
    ]
    failures = 0
    for test_fn in tests:
        name = test_fn.__name__
        try:
            test_fn()
            print(f"PASS {name}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL {name} {exc}")
        except Exception as exc:
            failures += 1
            print(f"FAIL {name} unexpected_error={exc}")
    return failures


if __name__ == "__main__":
    failed = _run_all_tests()
    if failed:
        raise SystemExit(1)
    raise SystemExit(0)
