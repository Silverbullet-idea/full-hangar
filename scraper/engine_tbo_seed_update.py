r"""
scraper/engine_tbo_seed_update.py

Updates the engine_tbo_reference table with complete data from:
  - TCM SIL98-9 (Continental Motors, Nov 1998)
  - Lycoming SI-1009BE (April 2020, supersedes 1009BD)

Usage:
  .venv312\Scripts\python.exe scraper\engine_tbo_seed_update.py
  .venv312\Scripts\python.exe scraper\engine_tbo_seed_update.py --dry-run
  .venv312\Scripts\python.exe scraper\engine_tbo_seed_update.py --manufacturer Continental
  .venv312\Scripts\python.exe scraper\engine_tbo_seed_update.py --manufacturer Lycoming
  .venv312\Scripts\python.exe scraper\engine_tbo_seed_update.py --verify-only
"""

import argparse
import os
from collections import defaultdict

from dotenv import load_dotenv
from supabase import create_client

load_dotenv("scraper/.env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]


# CONTINENTAL RECORDS - TCM SIL98-9
CONTINENTAL_RECORDS = [
    # Legacy/vintage
    {"engine_model": "A65", "tbo_hours": 1800, "applicable_aircraft": ["Piper J-3 Cub", "Aeronca Chief"]},
    {"engine_model": "A75", "tbo_hours": 1800, "applicable_aircraft": ["Piper J-3 Cub"]},
    {"engine_model": "C75", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 120", "Cessna 140"]},
    {"engine_model": "C85", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 120", "Cessna 140", "Cessna 150"]},
    {"engine_model": "C90", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 140A"]},
    {"engine_model": "C125", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "C145", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 170"]},
    {"engine_model": "E165", "tbo_hours": 1500, "has_serial_number_breakpoints": True, "variant_split_notes": "Note 1: S/N breakpoints apply"},
    {"engine_model": "E185", "tbo_hours": 1500, "has_serial_number_breakpoints": True},
    {"engine_model": "E225", "tbo_hours": 1500, "has_serial_number_breakpoints": True},
    # Common piston singles
    {"engine_model": "O-200-A", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 150 (pre-1966)"], "scoring_tbo_rationale": "TCM SIL98-9"},
    {"engine_model": "O-200-B", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 150 (pre-1966)"]},
    {"engine_model": "O-300-A", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 172 (1956-1967)"]},
    {"engine_model": "O-300-B", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 172"]},
    {"engine_model": "O-300-C", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 172"]},
    {"engine_model": "O-300-D", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 172"]},
    {"engine_model": "O-300-E", "tbo_hours": 1800, "applicable_aircraft": ["Cessna 172"]},
    {"engine_model": "GO-300-A", "tbo_hours": 1200, "applicable_aircraft": []},
    {"engine_model": "GO-300-C", "tbo_hours": 1200, "applicable_aircraft": []},
    {"engine_model": "GO-300-D", "tbo_hours": 1200, "applicable_aircraft": []},
    {"engine_model": "GO-300-E", "tbo_hours": 1200, "applicable_aircraft": []},
    # O-470 series
    {"engine_model": "O-470-A", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 180", "Cessna 182"]},
    {"engine_model": "O-470-B", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 180"]},
    {"engine_model": "O-470-E", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 195"]},
    {"engine_model": "O-470-G", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 180"]},
    {"engine_model": "O-470-J", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {"engine_model": "O-470-K", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {"engine_model": "O-470-L", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {"engine_model": "O-470-M", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {"engine_model": "O-470-N", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {"engine_model": "O-470-P", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {"engine_model": "O-470-R", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {"engine_model": "O-470-S", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182"]},
    {
        "engine_model": "O-470-U",
        "tbo_hours": 2000,
        "has_serial_number_breakpoints": True,
        "variant_split_notes": "Spec 11+ or upgraded to 2000 hr via parts replacement per Note 3. Older unmodified specs = 1500.",
        "applicable_aircraft": ["Cessna 182 (1977-1986)"],
        "scoring_tbo_rationale": "Default 2000 - most field engines are Spec 11+ or have been upgraded. Flag if spec is known to be older.",
    },
    {"engine_model": "IO-240-A", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "IO-240-B", "tbo_hours": 2000, "applicable_aircraft": ["Cessna 162 Skycatcher"]},
    {"engine_model": "IO-346-A", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-346-B", "tbo_hours": 1500, "applicable_aircraft": []},
    # IO-360 Continental
    {"engine_model": "IO-360-A", "tbo_hours": 1500, "applicable_aircraft": ["Beechcraft Musketeer", "Piper Cherokee"]},
    {"engine_model": "IO-360-AB", "tbo_hours": 1500, "applicable_aircraft": ["Beechcraft Musketeer"]},
    {"engine_model": "IO-360-B", "tbo_hours": 1500, "applicable_aircraft": ["Beechcraft Musketeer", "Piper Cherokee"]},
    {"engine_model": "IO-360-C", "tbo_hours": 1500, "applicable_aircraft": ["Piper Cherokee 180", "Piper Arrow early"]},
    {"engine_model": "IO-360-CB", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-D", "tbo_hours": 1500, "applicable_aircraft": ["Beechcraft Sundowner"]},
    {"engine_model": "IO-360-DB", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-ES", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "IO-360-G", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-GB", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-H", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-HB", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-J", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-JB", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-K", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "IO-360-KB", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "IO-470", "tbo_hours": 1500, "applicable_aircraft": ["Cessna 182 (early)", "Beechcraft Bonanza (early)"]},
    # IO-520
    {"engine_model": "IO-520-A", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Bonanza", "Cessna 210"]},
    {"engine_model": "IO-520-B", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Bonanza"]},
    {"engine_model": "IO-520-BA", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Baron"]},
    {"engine_model": "IO-520-BB", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Baron", "Cessna 210"]},
    {"engine_model": "IO-520-C", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210"]},
    {"engine_model": "IO-520-CB", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210"]},
    {"engine_model": "IO-520-D", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Bonanza"]},
    {"engine_model": "IO-520-E", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210"]},
    {"engine_model": "IO-520-F", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210"]},
    {"engine_model": "IO-520-J", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210"]},
    {"engine_model": "IO-520-K", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210"]},
    {"engine_model": "IO-520-L", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210"]},
    {"engine_model": "IO-520-M", "tbo_hours": 1700, "applicable_aircraft": ["Cessna Ag Truck"]},
    {"engine_model": "IO-520-MB", "tbo_hours": 1700, "applicable_aircraft": []},
    {"engine_model": "IO-520-P", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "LIO-520-P", "tbo_hours": 2000, "applicable_aircraft": []},
    # IO-550
    {"engine_model": "IO-550-A", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Bonanza", "Cessna TTx"]},
    {"engine_model": "IO-550-B", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Bonanza G36"]},
    {"engine_model": "IO-550-C", "tbo_hours": 1700, "applicable_aircraft": ["Cessna 210", "Beechcraft Baron 58"]},
    {"engine_model": "IO-550-D", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Bonanza"]},
    {"engine_model": "IO-550-E", "tbo_hours": 1700, "applicable_aircraft": ["Cessna TTx"]},
    {"engine_model": "IO-550-F", "tbo_hours": 1700, "applicable_aircraft": ["Beechcraft Bonanza"]},
    {"engine_model": "IO-550-G", "tbo_hours": 2000, "variant_split_notes": "Premium variant - 2000 hr TBO", "applicable_aircraft": []},
    {"engine_model": "IO-550-L", "tbo_hours": 1700, "applicable_aircraft": []},
    {"engine_model": "IO-550-N", "tbo_hours": 2000, "variant_split_notes": "Cirrus SR22 engine - 2000 hr TBO", "applicable_aircraft": ["Cirrus SR22"]},
    # Turbocharged variants
    {"engine_model": "TSIO-360-A", "tbo_hours": 1400, "applicable_aircraft": ["Cessna T182", "Piper Turbo Arrow"]},
    {"engine_model": "TSIO-360-B", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-C", "tbo_hours": 1400, "applicable_aircraft": ["Cessna T182"]},
    {"engine_model": "TSIO-360-D", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-E", "tbo_hours": 1400, "applicable_aircraft": ["Piper Turbo Arrow"]},
    {"engine_model": "TSIO-360-EB", "tbo_hours": 1800, "applicable_aircraft": ["Piper Turbo Arrow III/IV"]},
    {"engine_model": "TSIO-360-F", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-FB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-GB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-H", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-HB", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-JB", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-KB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-LB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-MB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-RB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "TSIO-360-SB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "LTSIO-360-E", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "LTSIO-360-EB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "LTSIO-360-KB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "LTSIO-360-RB", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "TSIO-470-B", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-470-C", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-470-D", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "GIO-470-A", "tbo_hours": 1000, "applicable_aircraft": []},
    # TSIO-520
    {"engine_model": "TSIO-520-B", "tbo_hours": 1400, "applicable_aircraft": ["Cessna 310", "Cessna T210"]},
    {"engine_model": "TSIO-520-BB", "tbo_hours": 1400, "applicable_aircraft": ["Cessna 310", "Pressurized Cessna 206"]},
    {"engine_model": "TSIO-520-C", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-D", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-DB", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-E", "tbo_hours": 1400, "applicable_aircraft": ["Cessna T210"]},
    {"engine_model": "TSIO-520-EB", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-G", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-H", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-J", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-JB", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-K", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-KB", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-L", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-LB", "tbo_hours": 1400, "applicable_aircraft": []},
    {
        "engine_model": "TSIO-520-M",
        "tbo_hours": 1600,
        "has_serial_number_breakpoints": True,
        "variant_split_notes": "Note 4: 1600 hr for Spec 6,7,8+; older specs may be 1400",
        "applicable_aircraft": [],
    },
    {"engine_model": "TSIO-520-N", "tbo_hours": 1400, "applicable_aircraft": []},
    {
        "engine_model": "TSIO-520-NB",
        "tbo_hours": 1600,
        "has_serial_number_breakpoints": True,
        "variant_split_notes": "Note 2: 1600 hr for S/N 521391+ or rebuilt 234070+",
        "applicable_aircraft": [],
    },
    {
        "engine_model": "TSIO-520-P",
        "tbo_hours": 1600,
        "has_serial_number_breakpoints": True,
        "variant_split_notes": "Note 4: 1600 hr for Spec 5,6+",
        "applicable_aircraft": [],
    },
    {
        "engine_model": "TSIO-520-R",
        "tbo_hours": 1600,
        "has_serial_number_breakpoints": True,
        "variant_split_notes": "Note 4: 1600 hr for Spec 7,9,10,11+",
        "applicable_aircraft": [],
    },
    {"engine_model": "TSIO-520-AF", "tbo_hours": 1600, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-AE", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "LTSIO-520-AE", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-BE", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-CE", "tbo_hours": 1600, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-T", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-UB", "tbo_hours": 1600, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-VB", "tbo_hours": 1600, "applicable_aircraft": []},
    {"engine_model": "TSIO-520-WB", "tbo_hours": 1600, "applicable_aircraft": []},
    # GTSIO-520
    {"engine_model": "GTSIO-520-C", "tbo_hours": 1600, "has_serial_number_breakpoints": True, "variant_split_notes": "Note 1: requires cylinder P/N 653453A6+", "applicable_aircraft": ["Cessna 421"]},
    {"engine_model": "GTSIO-520-D", "tbo_hours": 1600, "has_serial_number_breakpoints": True, "applicable_aircraft": ["Cessna 421"]},
    {"engine_model": "GTSIO-520-F", "tbo_hours": 1200, "applicable_aircraft": ["Cessna 421"]},
    {"engine_model": "GTSIO-520-H", "tbo_hours": 1600, "has_serial_number_breakpoints": True, "applicable_aircraft": ["Cessna 421"]},
    {"engine_model": "GTSIO-520-K", "tbo_hours": 1200, "applicable_aircraft": ["Cessna 421"]},
    {"engine_model": "GTSIO-520-L", "tbo_hours": 1600, "applicable_aircraft": ["Cessna 421C"]},
    {"engine_model": "GTSIO-520-M", "tbo_hours": 1600, "applicable_aircraft": ["Cessna 421C"]},
    {"engine_model": "GTSIO-520-N", "tbo_hours": 1600, "applicable_aircraft": ["Cessna 421C"]},
    # IO-550 / TSIO-550
    {"engine_model": "GIO-550-A", "tbo_hours": 1700, "applicable_aircraft": []},
    {"engine_model": "TSIO-550-B", "tbo_hours": 1600, "applicable_aircraft": ["Piper Mirage PA-46"]},
    {"engine_model": "TSIO-550-C", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "TSIO-550-E", "tbo_hours": 1600, "applicable_aircraft": []},
    {"engine_model": "TSIOL-550-A", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "TSIOL-550-B", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "TSIOL-550-C", "tbo_hours": 2000, "applicable_aircraft": []},
    # Other
    {"engine_model": "W670", "tbo_hours": 1000, "applicable_aircraft": ["Stearman PT-17"]},
    {"engine_model": "6-285", "tbo_hours": 1200, "applicable_aircraft": []},
]


# LYCOMING RECORDS - SI-1009BE (April 2020)
LYCOMING_RECORDS = [
    {"engine_model": "O-235", "tbo_hours": 2400, "has_serial_number_breakpoints": True, "variant_split_notes": "Note 12: 2400 hr requires LW-18729 pistons. F/G/J variants: 2000 hr only.", "applicable_aircraft": ["Cessna 150 (1966+)", "Cessna 152"], "scoring_tbo_rationale": "Default 2400 for C-series (most common). F/G/J variants: use 2000."},
    {"engine_model": "O-235-C2C", "tbo_hours": 2400, "applicable_aircraft": ["Cessna 150"]},
    {"engine_model": "O-235-L2C", "tbo_hours": 2400, "applicable_aircraft": ["Cessna 152"]},
    {"engine_model": "O-235-N2C", "tbo_hours": 2400, "applicable_aircraft": ["Cessna 152"]},
    {"engine_model": "O-235-F", "tbo_hours": 2000, "variant_split_notes": "Note 13: no 2400-hr path"},
    {"engine_model": "O-235-G", "tbo_hours": 2000, "variant_split_notes": "Note 13: no 2400-hr path"},
    {"engine_model": "O-235-J", "tbo_hours": 2000, "variant_split_notes": "Note 13: no 2400-hr path"},
    {"engine_model": "O-290-D", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "O-290-D2", "tbo_hours": 1500, "applicable_aircraft": []},
    {"engine_model": "O-320", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Cessna 172", "Piper Cherokee 160"], "scoring_tbo_rationale": "Base 2000. Extensions to 2200 (Note11) or 2200 (Note15) or 2400 (both) available for documented engines."},
    {"engine_model": "O-320-A2D", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Cessna 172 (1960-1967)"]},
    {"engine_model": "O-320-D2J", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Cessna 172 (1981-1986)"]},
    {"engine_model": "O-320-E2D", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Cessna 172 (1968-1976)"]},
    {"engine_model": "O-320-H", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "variant_split_notes": "Note 11 only (no Note 15 per original SIL). Known for AD issues (camshaft).", "applicable_aircraft": ["Cessna 172 (1977-1980)"], "scoring_tbo_rationale": "Treat same as O-320 base but flag AD-prone variant."},
    {"engine_model": "O-320-H2AD", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": ["Cessna 172 (1977-1980)"]},
    {"engine_model": "IO-320-A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200},
    {"engine_model": "IO-320-B", "tbo_hours": 2000, "aerobatic_engine": True, "tbo_hours_extension_note11": 200},
    {"engine_model": "IO-320-C", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "IO-320-D", "tbo_hours": 2000, "aerobatic_engine": True, "tbo_hours_extension_note11": 200},
    {"engine_model": "IO-320-E", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200},
    {"engine_model": "IO-320-F", "tbo_hours": 2000, "aerobatic_engine": True, "tbo_hours_extension_note11": 200},
    {"engine_model": "AIO-320", "tbo_hours": 1600, "aerobatic_engine": True, "variant_split_notes": "Note 6: aerobatic use - operator determines TBO. 1600 is max."},
    {"engine_model": "AEIO-320", "tbo_hours": 1600, "aerobatic_engine": True, "variant_split_notes": "Note 6: aerobatic. Max 1600."},
    {"engine_model": "O-340", "tbo_hours": 2000, "applicable_aircraft": []},
    {"engine_model": "O-360", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Cherokee 180", "Grumman AA-5", "Grumman Cheetah"]},
    {"engine_model": "O-360-A3A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Cherokee 180 PA-28-180"]},
    {"engine_model": "O-360-A4A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Cherokee 180 (later)"]},
    {"engine_model": "O-360-A1A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Cherokee 160", "Grumman AA-5"]},
    {"engine_model": "O-360-E", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "IO-360-L2A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Warrior PA-28-151", "Piper Warrior II PA-28-161"], "scoring_tbo_rationale": "2000 hr base + up to 400 hrs extensions. Key Warrior/Archer engine."},
    {"engine_model": "IO-360-A", "tbo_hours": 2000, "has_serial_number_breakpoints": True, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "variant_split_notes": "Note 5: S/N breakpoints - old engines 1200/1400 hrs; modern standard 2000.", "applicable_aircraft": ["Piper Archer PA-28-181", "Mooney M20"]},
    {"engine_model": "IO-360-C1C", "tbo_hours": 2000, "has_serial_number_breakpoints": True, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Arrow PA-28R", "Piper Archer"]},
    {"engine_model": "IO-360-B", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Grumman Tiger AA-5B", "Piper Arrow"]},
    {"engine_model": "IO-360-M1A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Mooney M20K (some)"]},
    {"engine_model": "TIO-360-A", "tbo_hours": 1200, "applicable_aircraft": ["Piper Turbo Cherokee Arrow (early)"]},
    {"engine_model": "TO-360-C", "tbo_hours": 1800, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TO-360-F", "tbo_hours": 1800, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TO-360-E", "tbo_hours": 1800, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-360-C", "tbo_hours": 1800, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "AIO-360", "tbo_hours": 1400, "aerobatic_engine": True, "variant_split_notes": "Note 6; 200HP aerobatic"},
    {"engine_model": "AEIO-360", "tbo_hours": 1600, "aerobatic_engine": True, "variant_split_notes": "Note 6; 180HP aerobatic"},
    {"engine_model": "IO-390-A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Archer TX", "Cessna 172S (IO-390 STC)"]},
    {"engine_model": "IO-390-C", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper Archer TX"]},
    {"engine_model": "IO-390-D", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["New model - added in 1009BE (2020)"]},
    {"engine_model": "AEIO-390-A", "tbo_hours": 1400, "aerobatic_engine": True},
    {"engine_model": "O-540", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32 Cherokee Six", "Piper Lance", "Piper Saratoga (early)"]},
    {"engine_model": "O-540-A", "tbo_hours": 2000, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32"]},
    {"engine_model": "O-540-B", "tbo_hours": 2000, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32"]},
    {"engine_model": "O-540-E4A5", "tbo_hours": 2000, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32"]},
    {"engine_model": "O-540-E4B5", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32"]},
    {"engine_model": "O-540-J", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32-300 Lance", "Piper Saratoga"]},
    {"engine_model": "O-540-F1B5", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Robinson R44", "Robinson R44 Cadet (see rotary wing)"], "variant_split_notes": "R44 standard: 2000. R44 Cadet: 2200."},
    {"engine_model": "IO-540-K", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32R-300 Lance", "Piper PA-32R-301 Saratoga"]},
    {"engine_model": "IO-540-L", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32R", "Cessna 182 (1996+)"]},
    {"engine_model": "IO-540-AB1A5", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Cessna 182T", "Cessna Turbo 182T (non-turbo variant)"]},
    {"engine_model": "IO-540-C", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32"]},
    {"engine_model": "IO-540-D", "tbo_hours": 2000, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-32"]},
    {"engine_model": "IO-540-E", "tbo_hours": 1600, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-G", "tbo_hours": 1600, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-P", "tbo_hours": 1600, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-J", "tbo_hours": 1800, "applicable_aircraft": ["Piper Navajo (some)"]},
    {"engine_model": "IO-540-R", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "IO-540-S", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "IO-540-AA", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "IO-540-A", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "IO-540-B", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "IO-540-J4A5", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-AG1A5", "tbo_hours": 1800, "applicable_aircraft": []},
    {"engine_model": "IO-540-M", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-N", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-T", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-V", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": []},
    {"engine_model": "IO-540-W", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": []},
    {"engine_model": "AEIO-540", "tbo_hours": 1400, "aerobatic_engine": True},
    {"engine_model": "TIO-540-A", "tbo_hours": 1800, "tbo_hours_extension_note11": 200, "has_serial_number_breakpoints": True, "variant_split_notes": "Note 14: old engines 1500 hr; L-1880-61+ = 1800", "applicable_aircraft": ["Piper PA-31 Navajo (some)"]},
    {"engine_model": "TIO-540-C", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "has_serial_number_breakpoints": True, "variant_split_notes": "Note 7: L-1754-61+ = 2000; older = 1500", "applicable_aircraft": ["Piper PA-31 Navajo Chieftain"]},
    {"engine_model": "TIO-540-J", "tbo_hours": 1800, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-540-V", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-540-W", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-540-AE", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-540-AA", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-540-AB", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-540-AF", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TIO-541-A", "tbo_hours": 1300, "applicable_aircraft": ["Piper PA-31P Pressurized Navajo"]},
    {"engine_model": "TIO-541-E", "tbo_hours": 1600, "has_serial_number_breakpoints": True, "variant_split_notes": "Note 9: L-804-59+, rebuilt March 1976+ = 1600; older = 1200", "applicable_aircraft": ["Piper PA-31P Pressurized Navajo"]},
    {"engine_model": "TIGO-541", "tbo_hours": 1200, "applicable_aircraft": []},
    {"engine_model": "IO-580-B1A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "tbo_hours_extension_note15": 200, "applicable_aircraft": ["Piper PA-46 Malibu/Mirage (some)", "Cessna 182 (some STC)"]},
    {"engine_model": "AEIO-580-B1A", "tbo_hours": 1400, "aerobatic_engine": True},
    {"engine_model": "IO-720", "tbo_hours": 1800, "tbo_hours_extension_note11": 200, "applicable_aircraft": ["Piper PA-34 Seneca (some)", "Large homebuilts"]},
    {"engine_model": "TEO-540-A1A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "TEO-540-C1A", "tbo_hours": 2000, "tbo_hours_extension_note11": 200, "applicable_aircraft": []},
    {"engine_model": "O-435", "tbo_hours": 1200, "applicable_aircraft": []},
    {"engine_model": "GO-435", "tbo_hours": 1200, "applicable_aircraft": []},
    {"engine_model": "GO-480", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "GSO-480", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "IGSO-480", "tbo_hours": 1400, "applicable_aircraft": []},
    {"engine_model": "IGO-540", "tbo_hours": 1200, "applicable_aircraft": []},
    {"engine_model": "IGSO-540", "tbo_hours": 1200, "applicable_aircraft": []},
]


def build_record(manufacturer, data, model_column):
    """Build a full DB record dict from shorthand data."""
    tbo = data.get("tbo_hours", 0)
    ext11 = data.get("tbo_hours_extension_note11", 0)
    ext15 = data.get("tbo_hours_extension_note15", 0)
    return {
        "manufacturer": manufacturer,
        model_column: data["engine_model"],
        "tbo_hours": tbo,
        "calendar_limit_years": data.get("calendar_limit_years", 12),
        "tbo_hours_extension_note11": ext11,
        "tbo_hours_extension_note15": ext15,
        "tbo_hours_max_with_extensions": data.get("tbo_hours_max_with_extensions") or (tbo + ext11 + ext15),
        "has_serial_number_breakpoints": data.get("has_serial_number_breakpoints", False),
        "variant_split_notes": data.get("variant_split_notes"),
        "applicable_aircraft": data.get("applicable_aircraft", []),
        "scoring_default_tbo": data.get("scoring_default_tbo") or tbo,
        "scoring_tbo_rationale": data.get("scoring_tbo_rationale"),
        "source_document": "Lycoming SI-1009BE" if manufacturer == "Lycoming" else "TCM SIL98-9",
        "source_document_revision": "Rev BE, April 2020" if manufacturer == "Lycoming" else "Nov 1998",
        "aerobatic_engine": data.get("aerobatic_engine", False),
    }


def detect_model_column(sb):
    probe = sb.table("engine_tbo_reference").select("*").limit(1).execute()
    sample = (probe.data or [{}])[0]
    if "engine_model" in sample:
        return "engine_model"
    if "engine_model_pattern" in sample:
        return "engine_model_pattern"
    raise RuntimeError("Neither engine_model nor engine_model_pattern exists on engine_tbo_reference.")


def verify_records(sb, model_column):
    result = sb.table("engine_tbo_reference").select(f"manufacturer, {model_column}, tbo_hours, scoring_default_tbo").execute()
    rows = result.data or []
    by_mfr = defaultdict(list)
    for row in rows:
        by_mfr[row["manufacturer"]].append(row)

    for manufacturer, recs in sorted(by_mfr.items()):
        tbos = [r["tbo_hours"] for r in recs if r.get("tbo_hours")]
        tbo_min = min(tbos) if tbos else "?"
        tbo_max = max(tbos) if tbos else "?"
        print(f"{manufacturer}: {len(recs)} records, TBO range {tbo_min}-{tbo_max}")

    checks = [
        ("Continental", "IO-550-N", 2000),
        ("Continental", "IO-550-C", 1700),
        ("Continental", "IO-520-B", 1700),
        ("Continental", "O-470-A", 1500),
        ("Lycoming", "O-235", 2400),
        ("Lycoming", "O-235-F", 2000),
        ("Lycoming", "IO-360-L2A", 2000),
        ("Lycoming", "O-320-H", 2000),
    ]
    print("\n--- Spot Checks ---")
    for manufacturer, model, expected in checks:
        match = [r for r in by_mfr.get(manufacturer, []) if r.get(model_column) == model]
        actual = match[0]["tbo_hours"] if match else "NOT FOUND"
        status = "PASS" if actual == expected else "FAIL"
        print(f"{status} {manufacturer} {model}: expected {expected}, got {actual}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--manufacturer", choices=["Continental", "Lycoming", "both"], default="both")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    model_column = detect_model_column(sb)

    if args.verify_only:
        verify_records(sb, model_column)
        return

    records_to_upsert = []
    if args.manufacturer in ("Continental", "both"):
        records_to_upsert.extend(build_record("Continental", record, model_column) for record in CONTINENTAL_RECORDS)

    if args.manufacturer in ("Lycoming", "both"):
        records_to_upsert.extend(build_record("Lycoming", record, model_column) for record in LYCOMING_RECORDS)

    print(f"Records to upsert: {len(records_to_upsert)}")

    if args.dry_run:
        for record in records_to_upsert[:5]:
            print(
                f"  {record['manufacturer']} {record[model_column]}: {record['tbo_hours']} hrs, "
                f"calendar {record['calendar_limit_years']} yrs, "
                f"ext11+{record['tbo_hours_extension_note11']} ext15+{record['tbo_hours_extension_note15']}"
            )
        print("  ... (dry run - not writing to DB)")
        return

    upserted = 0
    for i in range(0, len(records_to_upsert), 50):
        batch = records_to_upsert[i : i + 50]
        sb.table("engine_tbo_reference").upsert(batch, on_conflict=f"manufacturer,{model_column}").execute()
        upserted += len(batch)
        print(f"Upserted {upserted}/{len(records_to_upsert)}...")

    print(f"\nDone. {upserted} records upserted.")
    print("Run with --verify-only to confirm correctness.")


if __name__ == "__main__":
    main()
