"""Deterministic tests for aircraft intelligence scoring engine.

Plain-assert test module (no pytest dependency).
"""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta
from pprint import pformat

from core.intelligence.aircraft_intelligence import aircraft_intelligence_score


def base_listing_fixture() -> dict:
    """Return base listing fields requested for deterministic test setup."""
    today = date.today()
    return {
        "make": "Cessna",
        "model": "172",
        "year": datetime.now().year - 10,
        "asking_price": 150000,
        "engine_model": "Lycoming O-320-D2J",
        "engine_smoh": 800,
        "total_time": 4200,
        "prop_model": "Hartzell HC-C2YK",
        "prop_smoh": 600,
        "last_annual_date": (today - timedelta(days=90)).isoformat(),
        "elt_expiry_date": (today + timedelta(days=365)).isoformat(),
    }


def _listing_for_engine(input_listing: dict) -> dict:
    """Map fixture fields to intelligence engine schema and deterministic triggers."""
    listing = deepcopy(input_listing)
    description_tokens: list[str] = []

    # Include models in free text so normalizer/reference matching is deterministic.
    if listing.get("engine_model"):
        description_tokens.append(str(listing["engine_model"]))
    if listing.get("prop_model"):
        description_tokens.append(str(listing["prop_model"]))
    if listing.get("description"):
        description_tokens.append(str(listing["description"]))

    # Drive LLP annual status from date field.
    try:
        annual_dt = date.fromisoformat(str(listing.get("last_annual_date")))
        if annual_dt <= date.today() - timedelta(days=365):
            description_tokens.append("annual expired")
    except (TypeError, ValueError):
        pass

    # Drive LLP ELT status from date field.
    try:
        elt_dt = date.fromisoformat(str(listing.get("elt_expiry_date")))
        if elt_dt < date.today():
            description_tokens.append("elt expired")
    except (TypeError, ValueError):
        pass

    # Cirrus + parachute text triggers CAPS due logic in LLP rules.
    if str(listing.get("make", "")).upper() == "CIRRUS":
        description_tokens.append("parachute")

    listing["description"] = " ".join(description_tokens).strip()
    listing["description_full"] = listing["description"]
    listing["time_since_overhaul"] = listing.get("engine_smoh")
    listing["time_since_new_engine"] = None
    listing["time_since_prop_overhaul"] = listing.get("prop_smoh")
    listing["total_time_airframe"] = listing.get("total_time")
    return listing


def _assert_case(
    case_name: str,
    listing: dict,
    min_score: float,
    max_score: float,
    expected_risk_levels: tuple[str, ...],
    expected_present_keys: tuple[str, ...] = (),
    expected_absent_keys: tuple[str, ...] = (),
) -> dict:
    """Run score and assert score/risk/breakdown with rich failure details."""
    scored = aircraft_intelligence_score(_listing_for_engine(listing))
    details = pformat(scored, sort_dicts=True)

    value_score = float(scored.get("value_score", -1))
    assert min_score <= value_score <= max_score, (
        f"{case_name}: expected value_score in [{min_score}, {max_score}], "
        f"got {value_score}\nScored output:\n{details}"
    )

    risk_level = scored.get("risk_level")
    assert risk_level in expected_risk_levels, (
        f"{case_name}: expected risk_level in {expected_risk_levels}, got {risk_level}\n"
        f"Scored output:\n{details}"
    )

    breakdown = scored.get("deferred_maintenance", {}).get("breakdown", {})
    for key in expected_present_keys:
        assert breakdown.get(key, 0) > 0, (
            f"{case_name}: expected deferred breakdown key '{key}' to be > 0, "
            f"got {breakdown.get(key)}\nScored output:\n{details}"
        )
    for key in expected_absent_keys:
        assert breakdown.get(key, 0) == 0, (
            f"{case_name}: expected deferred breakdown key '{key}' to be 0, "
            f"got {breakdown.get(key)}\nScored output:\n{details}"
        )

    return scored


def test_engine_over_tbo() -> dict:
    listing = base_listing_fixture()
    listing["engine_smoh"] = 2200  # 200 hours past 2000 hr TBO
    listing["prop_smoh"] = 2200
    return _assert_case(
        case_name="test_engine_over_tbo",
        listing=listing,
        min_score=25,
        max_score=60,
        expected_risk_levels=("HIGH", "CRITICAL"),
        expected_present_keys=("engine_overhaul",),
    )


def test_engine_mid_life() -> dict:
    listing = base_listing_fixture()
    listing["engine_smoh"] = 1000  # 50% of 2000 hr TBO
    return _assert_case(
        case_name="test_engine_mid_life",
        listing=listing,
        min_score=55,
        max_score=95,
        expected_risk_levels=("LOW", "MODERATE"),
        expected_absent_keys=("engine_overhaul", "annual_due", "elt_due"),
    )


def test_calendar_exceeded() -> dict:
    listing = base_listing_fixture()
    listing["engine_smoh"] = 800
    listing["last_annual_date"] = (date.today() - timedelta(days=18 * 30)).isoformat()
    return _assert_case(
        case_name="test_calendar_exceeded",
        listing=listing,
        min_score=20,
        max_score=60,
        expected_risk_levels=("HIGH", "CRITICAL"),
        expected_present_keys=("annual_due",),
    )


def test_sensenich_no_calendar() -> dict:
    listing = base_listing_fixture()
    listing["year"] = datetime.now().year - 30
    listing["prop_model"] = "Sensenich 2A34C203"
    listing["prop_smoh"] = 5500
    scored = _assert_case(
        case_name="test_sensenich_no_calendar",
        listing=listing,
        min_score=40,
        max_score=95,
        expected_risk_levels=("LOW", "MODERATE", "HIGH"),
        expected_absent_keys=("prop_overhaul",),
    )
    details = pformat(scored, sort_dicts=True)
    assert scored["prop"]["calendar_overdue"] is False, (
        "test_sensenich_no_calendar: expected prop calendar_overdue == False for "
        f"Sensenich prop\nScored output:\n{details}"
    )
    return scored


def test_robinson_12yr() -> dict:
    listing = base_listing_fixture()
    listing["make"] = "Robinson"
    listing["model"] = "R44"
    listing["year"] = datetime.now().year - 13
    listing["total_time"] = 9000
    return _assert_case(
        case_name="test_robinson_12yr",
        listing=listing,
        min_score=10,
        max_score=75,
        expected_risk_levels=("HIGH", "CRITICAL"),
        expected_present_keys=("robinson_12yr",),
    )


def test_magneto_500hr() -> dict:
    listing = base_listing_fixture()
    listing["engine_smoh"] = 1000  # divisible by 500
    return _assert_case(
        case_name="test_magneto_500hr",
        listing=listing,
        min_score=45,
        max_score=95,
        expected_risk_levels=("LOW", "MODERATE"),
        expected_present_keys=("magneto_500hr",),
    )


def test_elt_expired() -> dict:
    listing = base_listing_fixture()
    listing["elt_expiry_date"] = (date.today() - timedelta(days=1)).isoformat()
    return _assert_case(
        case_name="test_elt_expired",
        listing=listing,
        min_score=20,
        max_score=60,
        expected_risk_levels=("HIGH", "CRITICAL"),
        expected_present_keys=("elt_due",),
    )


def test_caps_aircraft() -> dict:
    listing = base_listing_fixture()
    listing["make"] = "Cirrus"
    listing["model"] = "SR22"
    return _assert_case(
        case_name="test_caps_aircraft",
        listing=listing,
        min_score=20,
        max_score=90,
        expected_risk_levels=("HIGH", "CRITICAL"),
        expected_present_keys=("caps_due",),
    )


def test_all_green() -> dict:
    listing = base_listing_fixture()
    listing["engine_smoh"] = 450  # ~25% of 2000 hr TBO, avoids magneto trigger
    listing["prop_smoh"] = 500
    listing["prop_overhaul_date"] = (date.today() - timedelta(days=365)).isoformat()
    listing["last_annual_date"] = (date.today() - timedelta(days=30)).isoformat()
    listing["elt_expiry_date"] = (date.today() + timedelta(days=365)).isoformat()
    return _assert_case(
        case_name="test_all_green",
        listing=listing,
        min_score=60,
        max_score=100,
        expected_risk_levels=("LOW", "MODERATE"),
        expected_absent_keys=("engine_overhaul", "prop_overhaul", "annual_due", "elt_due", "caps_due", "robinson_12yr"),
    )


def test_all_critical() -> dict:
    listing = base_listing_fixture()
    listing["engine_smoh"] = 2200
    listing["prop_smoh"] = 2500
    listing["last_annual_date"] = (date.today() - timedelta(days=500)).isoformat()
    listing["elt_expiry_date"] = (date.today() - timedelta(days=2)).isoformat()
    return _assert_case(
        case_name="test_all_critical",
        listing=listing,
        min_score=0,
        max_score=29.9,
        expected_risk_levels=("CRITICAL",),
        expected_present_keys=("engine_overhaul", "prop_overhaul", "annual_due", "elt_due"),
    )


def test_deregistered_aircraft() -> dict:
    listing = base_listing_fixture()
    listing["faa_registration_alert"] = "DEREGISTERED - VERIFY BEFORE PURCHASE"
    return _assert_case(
        case_name="test_deregistered_aircraft",
        listing=listing,
        min_score=0,
        max_score=100,
        expected_risk_levels=("CRITICAL",),
    )


def test_sparse_listing_old_year_not_clustered() -> dict:
    listing = base_listing_fixture()
    listing["year"] = 1968
    listing["engine_smoh"] = None
    listing["prop_smoh"] = None
    scored = _assert_case(
        case_name="test_sparse_listing_old_year_not_clustered",
        listing=listing,
        min_score=20,
        max_score=75,
        expected_risk_levels=("MODERATE", "HIGH"),
    )
    value_score = float(scored["value_score"])
    details = pformat(scored, sort_dicts=True)
    assert not (50.0 <= value_score <= 53.0), (
        "test_sparse_listing_old_year_not_clustered: sparse listing clustered around "
        f"midpoint score {value_score}\nScored output:\n{details}"
    )
    return scored


def test_sparse_listing_newer_year_spreads_above_old() -> dict:
    old_listing = base_listing_fixture()
    old_listing["year"] = 1968
    old_listing["engine_smoh"] = None
    old_listing["prop_smoh"] = None
    old_scored = aircraft_intelligence_score(_listing_for_engine(old_listing))

    newer_listing = base_listing_fixture()
    newer_listing["year"] = 2005
    newer_listing["engine_smoh"] = None
    newer_listing["prop_smoh"] = None
    newer_scored = _assert_case(
        case_name="test_sparse_listing_newer_year_spreads_above_old",
        listing=newer_listing,
        min_score=20,
        max_score=85,
        expected_risk_levels=("MODERATE", "HIGH"),
    )
    old_score = float(old_scored["value_score"])
    new_score = float(newer_scored["value_score"])
    details = pformat({"old": old_scored, "new": newer_scored}, sort_dicts=True)
    assert new_score > old_score, (
        "test_sparse_listing_newer_year_spreads_above_old: expected newer sparse listing "
        f"to score above older sparse listing ({new_score} <= {old_score})\n{details}"
    )
    assert new_score != old_score, (
        "test_sparse_listing_newer_year_spreads_above_old: expected different sparse scores "
        f"for different years ({new_score} == {old_score})\n{details}"
    )
    return newer_scored


def test_high_data_listing_scores_high() -> dict:
    listing = base_listing_fixture()
    listing["year"] = 2012
    listing["engine_smoh"] = 200
    listing["prop_smoh"] = 180
    listing["asking_price"] = 165000
    listing["description"] = (
        "Garmin G500 TXi GTN750Xi GTX345R GFC500 WAAS ADS-B complete logbooks"
    )
    scored = aircraft_intelligence_score(_listing_for_engine(listing))
    details = pformat(scored, sort_dicts=True)
    assert float(scored["value_score"]) >= 70.0, (
        "test_high_data_listing_scores_high: expected high-data listing >= 70 "
        f"got {scored['value_score']}\nScored output:\n{details}"
    )
    assert scored.get("risk_level") in {"LOW", "MODERATE"}, (
        "test_high_data_listing_scores_high: expected LOW/MODERATE risk got "
        f"{scored.get('risk_level')}\nScored output:\n{details}"
    )
    return scored


def test_hard_safety_override_forces_critical() -> dict:
    listing = base_listing_fixture()
    listing["engine_smoh"] = 150
    listing["prop_smoh"] = 120
    listing["faa_registration_alert"] = "DEREGISTERED - DO NOT OPERATE"
    listing["description"] = "annual expired elt expired llp expired"
    scored = aircraft_intelligence_score(_listing_for_engine(listing))
    details = pformat(scored, sort_dicts=True)
    assert scored.get("risk_level") == "CRITICAL", (
        "test_hard_safety_override_forces_critical: expected CRITICAL risk\n"
        f"Scored output:\n{details}"
    )
    assert float(scored["value_score"]) <= 25.0, (
        "test_hard_safety_override_forces_critical: expected value_score <= 25 "
        f"got {scored['value_score']}\nScored output:\n{details}"
    )
    return scored


def _run_all_tests() -> int:
    tests = [
        test_engine_over_tbo,
        test_engine_mid_life,
        test_calendar_exceeded,
        test_sensenich_no_calendar,
        test_robinson_12yr,
        test_magneto_500hr,
        test_elt_expired,
        test_caps_aircraft,
        test_all_green,
        test_all_critical,
        test_deregistered_aircraft,
        test_sparse_listing_old_year_not_clustered,
        test_sparse_listing_newer_year_spreads_above_old,
        test_high_data_listing_scores_high,
        test_hard_safety_override_forces_critical,
    ]

    failures = 0
    for test_fn in tests:
        name = test_fn.__name__
        try:
            scored = test_fn()
            print(f"PASS {name} value_score={scored['value_score']}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL {name} {exc}")
        except Exception as exc:  # Defensive output for non-assert failures.
            failures += 1
            print(f"FAIL {name} unexpected_error={exc}")
    return failures


if __name__ == "__main__":
    failed = _run_all_tests()
    if failed:
        raise SystemExit(1)
    raise SystemExit(0)
