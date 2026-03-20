from __future__ import annotations

from scraper.description_parser import (
    PARSER_VERSION,
    extract_avionics_detailed,
    extract_avionics_unresolved,
    extract_engine_model,
    extract_hours_since_iran,
    extract_last_annual_inspection,
    extract_cylinder_time_since_new,
    extract_avionics,
    extract_fuel_capacity,
    extract_fractional_pricing,
    extract_mods_and_stcs,
    extract_special_equipment,
    extract_times,
    extract_useful_load,
    parse_description,
)


def test_extract_times_ttaf_and_smoh() -> None:
    text = "TTAF: 2,450 with 420 SMOH and 350 SPOH."
    result = extract_times(text)
    assert result["total_time"] == 2450
    assert result["engine_smoh"] == 420
    assert result["prop_spoh"] == 350


def test_extract_times_sram_since_major_stop() -> None:
    text = "420 SRAM, 120 since top, 5,400 total time"
    result = extract_times(text)
    assert result["engine_smoh"] == 420
    assert result["engine_stop"] == 120
    assert result["total_time"] == 5400


def test_extract_times_expanded_acronyms_and_phrases() -> None:
    text = "Engine 1,234.5 TSMOH, 210 TSTOH, and 55 TSN."
    result = extract_times(text)
    assert result["engine_smoh"] == 1234.5
    assert result["engine_stop"] == 210
    assert result["engine_time_since_new"] == 55


def test_extract_times_skips_tso_c_references() -> None:
    text = "Garmin GTX345R TSO-C166b compliant transponder."
    result = extract_times(text)
    assert "engine_smoh" not in result


def test_extract_times_factory_overhaul_and_zero_time_signal() -> None:
    text = "1200 since factory overhaul with factory reman engine."
    result = extract_times(text)
    assert result["engine_sfoh"] == 1200
    assert result["engine_time_since_new"] == 0


def test_extract_engine_model_sanitizes_trailing_narrative() -> None:
    text = (
        "Engine Model: Continental TSIO-550-C (310 hp twin-turbo) - 1131 TT since new "
        "Annual Inspection: December 2024"
    )
    assert extract_engine_model(text) == "Continental TSIO-550-C (310 hp twin-turbo)"


def test_extract_avionics_dedupes_aliases() -> None:
    text = "Garmin 750, GTN 750, GNS 430W, Aspen EFD, ADSB Out"
    result = extract_avionics(text)
    assert "Garmin GTN 750" in result
    assert "Garmin GNS 430W" in result
    assert "Aspen EFD1000" in result
    assert "ADS-B Out" in result
    assert result.count("Garmin GTN 750") == 1


def test_extract_avionics_detailed_quantities() -> None:
    text = "Panel includes dual G5s and 2x GTN750Xi units with GTX 345."
    detailed = extract_avionics_detailed(text)
    indexed = {item["canonical_name"]: item for item in detailed}
    assert indexed["Garmin G5 EFIS"]["quantity"] == 2
    assert indexed["Garmin GTN 750"]["quantity"] == 2
    assert indexed["Garmin GTX 345"]["quantity"] == 1


def test_extract_avionics_unresolved_tokens() -> None:
    text = "Avionics include GTN 750Xi, KX165A and PMA450B audio panel."
    detailed = extract_avionics_detailed(text)
    unresolved = extract_avionics_unresolved(text, detailed)
    # KX165A/PMA450B are now recognized aliases and should not remain unresolved.
    assert "KX165A" not in unresolved
    assert "PMA450B" not in unresolved
    assert "GTN750XI" not in unresolved


def test_extract_avionics_new_alias_expansion() -> None:
    text = "Panel: GNS430, GTX327, GMA340, and IFD550 upgrade."
    result = extract_avionics(text)
    assert "Garmin GNS 430" in result
    assert "Garmin GTX 327" in result
    assert "Garmin GMA 340 Audio Panel" in result
    assert "Avidyne IFD 550" in result


def test_extract_avionics_additional_alias_expansion() -> None:
    text = "Panel: IFD440, IFD540, GFC500 autopilot, and GI275 backup."
    result = extract_avionics(text)
    assert "Avidyne IFD 440" in result
    assert "Avidyne IFD 540" in result
    assert "Garmin GFC 500 Autopilot" in result
    assert "Garmin GI 275" in result


def test_extract_avionics_dense_multi_aliases() -> None:
    text = "Avionics: GTN750, GTX345R remote transponder, and dual G5."
    result = extract_avionics(text)
    assert "Garmin GTN 750" in result
    assert "Garmin GTX 345" in result
    assert "Garmin G5 EFIS" in result


def test_extract_avionics_combo_shorthand_maps_both_units() -> None:
    text = "Updated panel with Garmin 650/750 stack and GTX345."
    detailed = extract_avionics_detailed(text)
    indexed = {item["canonical_name"]: item for item in detailed}
    assert "Garmin GTN 650" in indexed
    assert "Garmin GTN 750" in indexed


def test_extract_avionics_high_frequency_unresolved_aliases() -> None:
    text = "Suite includes KX155, GFC600, IFD440, GNX375, GTX335R, and KFC150."
    result = extract_avionics(text)
    assert "Bendix/King KX 155" in result
    assert "Garmin GFC 600 Autopilot" in result
    assert "Avidyne IFD 440" in result
    assert "Garmin GNX 375" in result
    assert "Garmin GTX 335" in result
    assert "Bendix/King KFC 150" in result


def test_extract_avionics_legacy_king_and_stec_variants() -> None:
    text = "Panel has KX170B, KX165, KFC200 and S-TEC30 autopilot."
    result = extract_avionics(text)
    assert "Bendix/King KX 170B" in result
    assert "Bendix/King KX 165" in result
    assert "Bendix/King KFC 200" in result
    assert "S-TEC 30 Autopilot" in result


def test_extract_avionics_compact_variants_and_adsb() -> None:
    text = "Panel: GTN650XI, GNS530W, GMA350, GTX330ES, ADSBOUT."
    result = extract_avionics(text)
    assert "Garmin GTN 650" in result
    assert "Garmin GNS 530W" in result
    assert "Garmin GMA 350 Audio Panel" in result
    assert "Garmin GTX 330ES Transponder" in result
    assert "ADS-B Out" in result


def test_extract_mods_and_stcs() -> None:
    text = "Features Robertson STOL, speed brakes, and Osborne tip tanks."
    result = extract_mods_and_stcs(text)
    assert "Robertson STOL Kit" in result
    assert "Speed Brakes" in result
    assert "Tip Tanks" in result


def test_extract_useful_load_patterns() -> None:
    assert extract_useful_load("Useful load: 1,546") == 1546
    assert extract_useful_load("UL 1320") == 1320


def test_extract_fuel_capacity_patterns() -> None:
    assert extract_fuel_capacity("114 gal usable fuel") == 114
    assert extract_fuel_capacity("Total fuel 92") == 92


def test_extract_special_equipment() -> None:
    result = extract_special_equipment("Includes O2 system, TKS de-ice, and air conditioning.")
    assert result["oxygen_system"] is True
    assert result["known_ice"] is True
    assert result["air_conditioning"] is True


def test_extract_maintenance_markers() -> None:
    text = (
        "New cylinders installed at 727 hours since new. "
        "25 hours since IRAN completed. Annual Inspection: December 2024."
    )
    assert extract_cylinder_time_since_new(text) == 727
    assert extract_hours_since_iran(text) == 25
    assert extract_last_annual_inspection(text) == "December 2024"


def test_parse_description_example_payload() -> None:
    text = (
        "1978 Beechcraft A36 TN, Whirlwind III Turbo-Normalized IO-550, 420 SRAM Overhaul, "
        "5400 TT, Garmin 650/750, G-5, Aspen, S-TEC 3100, Tip Tanks, 1546 Useful Load"
    )
    parsed = parse_description(text)
    assert parsed["engine"]["smoh"] == 420
    assert parsed["engine"]["tt"] == 5400
    assert parsed["engine"]["model"] == "IO-550"
    assert "Turbo Normalizing" in parsed["mods"]
    assert "Tip Tanks" in parsed["mods"]
    assert "Garmin GTN 750" in parsed["avionics"]
    assert parsed["avionics_parser_version"] == PARSER_VERSION
    assert any(item["canonical_name"] == "Garmin GTN 750" for item in parsed["avionics_detailed"])
    assert parsed["useful_load_lbs"] == 1546
    assert parsed["confidence"] >= 0.7


def test_parse_description_sets_no_damage_history_boolean() -> None:
    parsed = parse_description("NDH aircraft, always hangared.")
    assert parsed["no_damage_history"] is True


def test_parse_description_contract_includes_new_time_fields() -> None:
    parsed = parse_description("s/OH 800, since top OH 200, SFOH 1200, TSN 55")
    assert parsed["smoh"] == 800
    assert parsed["stoh"] == 200
    assert parsed["sfoh"] == 1200
    assert parsed["time_since_new"] == 55


def test_parse_description_empty() -> None:
    parsed = parse_description("")
    assert parsed["engine"] == {}
    assert parsed["mods"] == []
    assert parsed["avionics"] == []
    assert parsed["confidence"] == 0.0


def test_parse_description_low_signal() -> None:
    parsed = parse_description("Clean aircraft, fresh paint and interior.")
    assert parsed["confidence"] <= 0.35
    assert parsed["times"] == {}


def test_parse_description_maintenance_payload() -> None:
    text = (
        "Continental TSIO-550-C (310 hp twin-turbo) - 1131 TT since new. "
        "New cylinders installed at 727 hours since new. "
        "25 hours since IRAN. Annual Inspection: December 2024."
    )
    parsed = parse_description(text)
    assert parsed["engine"]["model"] == "Continental TSIO-550-C (310 hp twin-turbo)"
    assert parsed["engine"]["tt"] == 1131
    assert parsed["maintenance"]["cylinders_since_new_hours"] == 727
    assert parsed["maintenance"]["hours_since_iran"] == 25
    assert parsed["maintenance"]["last_annual_inspection"] == "December 2024"


def test_extract_fractional_pricing_explicit_ratio() -> None:
    text = "Rare opportunity: 1/10th partnership available. Price $14,500."
    parsed = extract_fractional_pricing(text)
    assert parsed["is_fractional"] is True
    assert parsed["share_numerator"] == 1
    assert parsed["share_denominator"] == 10
    assert parsed["share_price"] == 14500
    assert parsed["normalized_full_price"] == 145000
    assert parsed["review_needed"] is False


def test_extract_fractional_pricing_percent_share() -> None:
    text = "Offering 10% ownership share at $22,000."
    parsed = extract_fractional_pricing(text)
    assert parsed["is_fractional"] is True
    assert parsed["share_numerator"] == 1
    assert parsed["share_denominator"] == 10
    assert parsed["share_percent"] == 10.0
    assert parsed["normalized_full_price"] == 220000


def test_extract_fractional_pricing_ambiguous_flag_only() -> None:
    text = "Well-managed partnership aircraft. Contact for details."
    parsed = extract_fractional_pricing(text)
    assert parsed["is_fractional"] is False
    assert parsed["normalized_full_price"] is None
    assert parsed["review_needed"] is True


def test_extract_fractional_pricing_negative_control() -> None:
    text = "Engine has 1/10 compression wear noted in old report."
    parsed = extract_fractional_pricing(text)
    assert parsed["is_fractional"] is False
    assert parsed["review_needed"] is False


def test_parse_description_includes_pricing_context() -> None:
    text = "1/10th ownership available in this Cessna. Partnership sale."
    parsed = parse_description(text, observed_price=14500)
    pricing = parsed["pricing_context"]
    assert pricing["is_fractional"] is True
    assert pricing["share_price"] == 14500
    assert pricing["normalized_full_price"] == 145000


def test_extract_prop_model_trims_narrative_from_fallback_signal() -> None:
    text = "Hartzell propeller has 256 hours since overhaul and comes with polished spinner."
    parsed = parse_description(text)
    assert parsed["prop_model"] == "Hartzell propeller"

