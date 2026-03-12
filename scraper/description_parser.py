from __future__ import annotations

import re
from typing import Any

PARSER_VERSION = "2.1.3"

TOKEN_CANDIDATE_RE = re.compile(
    r"\b(?:GTN[\- ]?\d{3}(?:XI)?|GNS[\- ]?\d{3}W?|IFD[\- ]?\d{3}|GNX[\- ]?\d{3}|GPS[\- ]?\d{3}|"
    r"GFC[\- ]?\d{3}|GTX[\- ]?\d{2,4}[A-Z]{0,2}|GMA[\- ]?\d{2,4}|GTC[\- ]?\d{2,4}|GTS[\- ]?\d{2,4}|"
    r"GIA[\- ]?\d{2,4}[A-Z]?|GDU[\- ]?\d{2,4}|GEA[\- ]?\d{2,4}|GRS[\- ]?\d{2,4}|GSR[\- ]?\d{2,4}|"
    r"GDL[\- ]?\d{2,4}[A-Z]?|GMU[\- ]?\d{2,4}|GDC[\- ]?\d{2,4}[A-Z]?|GCU[\- ]?\d{2,4}|GMC[\- ]?\d{2,4}|"
    r"KAP[\- ]?\d{2,4}|KFC[\- ]?\d{2,4}|KX[\- ]?\d{2,4}[A-Z]?|KLN[\- ]?\d{2,4}[A-Z]?|KGX[\- ]?\d{2,4}|"
    r"STEC[\- ]?\d{2,4}[A-Z]?|S[\- ]?TEC[\- ]?\d{2,4}[A-Z]?|PMA[\- ]?\d{2,4}[A-Z]?|NGT[\- ]?\d{2,4})\b"
)


AVIONICS_MAP: dict[str, str] = {
    r"\bGarmin\s*650\s*/\s*750\b": "Garmin GTN 750",
    r"\bGTN750\b": "Garmin GTN 750",
    r"\bGTN[\s\-]?750(?:\s*XI|XI)?\b": "Garmin GTN 750",
    r"\bGarmin[\s\-]?(GTN[\s\-]?750|750)\b": "Garmin GTN 750",
    r"\bGTN[\s\-]?650(?:\s*XI|XI)?\b": "Garmin GTN 650",
    r"\bGTN[\s\-]?625\b": "Garmin GTN 625",
    r"\bGNS[\s\-]?650W\b": "Garmin GTN 650",
    r"\bGNS[\s\-]?650\b": "Garmin GTN 650",
    r"\bGarmin[\s\-]?(GTN[\s\-]?650|650)\b": "Garmin GTN 650",
    r"\bGNS[\s\-]?430W\b": "Garmin GNS 430W",
    r"\bGNS[\s\-]?430\b": "Garmin GNS 430",
    r"\bGNS[\s\-]?530W?\b": "Garmin GNS 530W",
    r"\bG1000\b": "Garmin G1000",
    r"\bG2000\b": "Garmin G2000",
    r"\bAspen(?:\s+EFD)?\b": "Aspen EFD1000",
    r"\bADS[\s\-]?B(?:\s*(?:OUT|IN\/OUT|IN\s*OUT))?\b": "ADS-B Out",
    r"\bADS[\s\-]?B\s*IN\b": "ADS-B In",
    r"\bSTEC[\s\-]?55X\b|\bS[\s\-]?TEC[\s\-]?55X\b|\bSTEC[\s\-]?55\b": "S-TEC 55X Autopilot",
    r"\bKAP[\s\-]?140\b": "Bendix/King KAP 140",
    r"\bG[\s\-]?5s?\b": "Garmin G5 EFIS",
    r"\bS[\s\-]?TEC[\s\-]?3100\b": "S-TEC 3100 DFCS",
    r"\bIFD[\s\-]?550\b": "Avidyne IFD 550",
    r"\bIFD[\s\-]?540\b": "Avidyne IFD 540",
    r"\bIFD[\s\-]?440\b": "Avidyne IFD 440",
    r"\bGMA[\s\-]?3[56]\b": "Garmin GMA 36/35 Audio Panel",
    r"\bGMA[\s\-]?350\b": "Garmin GMA 350 Audio Panel",
    r"\bGMA[\s\-]?340\b": "Garmin GMA 340 Audio Panel",
    r"\bGMA[\s\-]?345\b": "Garmin GMA 345 Audio Panel",
    r"\bGMA[\s\-]?347\b": "Garmin GMA 347 Audio Panel",
    r"\bGMA[\s\-]?342\b": "Garmin GMA 342 Audio Panel",
    r"\bGMA[\s\-]?1360\b": "Garmin GMA 1360 Audio Panel",
    r"\bGMA[\s\-]?1347\b": "Garmin GMA 1347 Audio Panel",
    r"\bGTC[\s\-]?570\b": "Garmin GTC 570 Controller",
    r"\bGTX[\s\-]?345R\b": "Garmin GTX 345",
    r"\bGTX[\s\-]?345\b": "Garmin GTX 345",
    r"\bGTX[\s\-]?335R\b": "Garmin GTX 335",
    r"\bGTX[\s\-]?335\b": "Garmin GTX 335",
    r"\bGTX[\s\-]?33\b": "Garmin GTX 33",
    r"\bGTX[\s\-]?330\b": "Garmin GTX 330",
    r"\bGTX[\s\-]?327\b": "Garmin GTX 327",
    r"\bGTX[\s\-]?3000\b": "Garmin GTX 3000",
    r"\bGTX[\s\-]?33ES\b": "Garmin GTX 33ES Transponder",
    r"\bGTX[\s\-]?330ES\b": "Garmin GTX 330ES Transponder",
    r"\bGTX[\s\-]?320A\b": "Garmin GTX 320A",
    r"\bGTX[\s\-]?320\b": "Garmin GTX 320",
    r"\bGTX[\s\-]?32\b": "Garmin GTX 320",
    r"\bGTX[\s\-]?325\b": "Garmin GTX 325",
    r"\bGTX[\s\-]?328\b": "Garmin GTX 328",
    r"\bGTX[\s\-]?337\b": "Garmin GTX 337",
    r"\bGTX[\s\-]?340\b": "Garmin GTX 340",
    r"\bGTX[\s\-]?33D\b": "Garmin GTX 33D",
    r"\bGTX[\s\-]?33R\b": "Garmin GTX 33R",
    r"\bGTX[\s\-]?33X\b": "Garmin GTX 33X",
    r"\bGTX[\s\-]?330D\b": "Garmin GTX 330D",
    r"\bGTX[\s\-]?345DR\b": "Garmin GTX 345DR",
    r"\bGTX[\s\-]?345D\b": "Garmin GTX 345D",
    r"\bGTX[\s\-]?355\b": "Garmin GTX 355",
    r"\bGTX[\s\-]?435\b": "Garmin GTX 435",
    r"\bGTX[\s\-]?354R\b": "Garmin GTX 354R",
    r"\bGTX[\s\-]?35R\b": "Garmin GTX 35R",
    r"\bGTX[\s\-]?300\b": "Garmin GTX 300",
    r"\bGTX[\s\-]?200\b": "Garmin GTX 200",
    r"\bGTX[\s\-]?800\b": "Garmin GTX 800",
    r"\bGTX[\s\-]?750\b": "Garmin GTX 750",
    r"\bGTX[\s\-]?245R\b": "Garmin GTX 245R",
    r"\bGTS[\s\-]?800\b": "Garmin GTS 800 Traffic",
    r"\bGTS[\s\-]?820\b": "Garmin GTS 820 Traffic",
    r"\bGTS[\s\-]?825\b": "Garmin GTS 825 Traffic",
    r"\bGTS[\s\-]?855\b": "Garmin GTS 855 Traffic",
    r"\bGTS[\s\-]?600\b": "Garmin GTS 600 Traffic",
    r"\bGTS[\s\-]?8000\b": "Garmin GTS 8000 Traffic",
    r"\bGTX[\s\-]?375\b": "Garmin GTX 375",
    r"\bGIA[\s\-]?63W\b": "Garmin GIA 63W NAV/COM/GPS",
    r"\bGIA[\s\-]?63\b": "Garmin GIA 63 NAV/COM/GPS",
    r"\bGIA[\s\-]?64W\b": "Garmin GIA 64W NAV/COM/GPS",
    r"\bGIA[\s\-]?64\b": "Garmin GIA 64 NAV/COM/GPS",
    r"\bGSR[\s\-]?56\b": "Garmin GSR 56 Iridium",
    r"\bGDU[\s\-]?1400\b": "Garmin GDU 1400 Display",
    r"\bGDU[\s\-]?1040\b": "Garmin GDU 1040 Display",
    r"\bGDU[\s\-]?1044\b": "Garmin GDU 1044 Display",
    r"\bGDU[\s\-]?1045\b": "Garmin GDU 1045 Display",
    r"\bGDU[\s\-]?1050\b": "Garmin GDU 1050 Display",
    r"\bGDU[\s\-]?1060\b": "Garmin GDU 1060 Display",
    r"\bGDU[\s\-]?460\b": "Garmin GDU 460 Display",
    r"\bGDU[\s\-]?465\b": "Garmin GDU 465 Display",
    r"\bGDU[\s\-]?470\b": "Garmin GDU 470 Display",
    r"\bGDU[\s\-]?620\b": "Garmin GDU 620 Display",
    r"\bGDU[\s\-]?1042\b": "Garmin GDU 1042 Display",
    r"\bGDU[\s\-]?1500\b": "Garmin GDU 1500 Display",
    r"\bGDU[\s\-]?1550\b": "Garmin GDU 1550 Display",
    r"\bGDU[\s\-]?10\b": "Garmin GDU 10 Display",
    r"\bGEA[\s\-]?71\b": "Garmin GEA 71 Engine/Airframe",
    r"\bGEA[\s\-]?110\b": "Garmin GEA 110 Engine/Airframe",
    r"\bGEA[\s\-]?24\b": "Garmin GEA 24 Engine/Airframe",
    r"\bGRS[\s\-]?77\b": "Garmin GRS 77 AHRS",
    r"\bGRS[\s\-]?79\b": "Garmin GRS 79 AHRS",
    r"\bGDC[\s\-]?74A\b": "Garmin GDC 74A Air Data Computer",
    r"\bGDC[\s\-]?74\b": "Garmin GDC 74 Air Data Computer",
    r"\bGDC[\s\-]?74B\b": "Garmin GDC 74B Air Data Computer",
    r"\bGDC[\s\-]?7400\b": "Garmin GDC 7400 Air Data Computer",
    r"\bGDC[\s\-]?72\b": "Garmin GDC 72 Air Data Computer",
    r"\bGDC[\s\-]?72A\b": "Garmin GDC 72A Air Data Computer",
    r"\bGDC[\s\-]?72B\b": "Garmin GDC 72B Air Data Computer",
    r"\bGMU[\s\-]?44\b": "Garmin GMU 44 Magnetometer",
    r"\bGMU[\s\-]?11\b": "Garmin GMU 11 Magnetometer",
    r"\bGCU[\s\-]?275\b": "Garmin GCU 275 Controller",
    r"\bGCU[\s\-]?476\b": "Garmin GCU 476 Controller",
    r"\bGCU[\s\-]?477\b": "Garmin GCU 477 Controller",
    r"\bGCU[\s\-]?485\b": "Garmin GCU 485 Controller",
    r"\bGCU[\s\-]?475\b": "Garmin GCU 475 Controller",
    r"\bGFC[\s\-]?700\b": "Garmin GFC 700 Autopilot",
    r"\bGFC[\s\-]?600\b": "Garmin GFC 600 Autopilot",
    r"\bGFC[\s\-]?500\b": "Garmin GFC 500 Autopilot",
    r"\bGMC[\s\-]?720\b": "Garmin GMC 720 AFCS Controller",
    r"\bGMC[\s\-]?507\b": "Garmin GMC 507 AFCS Controller",
    r"\bGMC[\s\-]?710\b": "Garmin GMC 710 AFCS Controller",
    r"\bGMC[\s\-]?707\b": "Garmin GMC 707 AFCS Controller",
    r"\bGMC[\s\-]?350\b": "Garmin GMC 350 AFCS Controller",
    r"\bGMC[\s\-]?307\b": "Garmin GMC 307 AFCS Controller",
    r"\bGI[\s\-]?275\b": "Garmin GI 275",
    r"\bGNX[\s\-]?375\b": "Garmin GNX 375",
    r"\bGNX[\s\-]?750\b": "Garmin GNX 750",
    r"\bGPS[\s\-]?175\b": "Garmin GPS 175",
    r"\bG500[\s\-]?TXI\b|\bG500TXI\b": "Garmin G500 TXi",
    r"\bG600[\s\-]?TXI\b|\bG600TXI\b": "Garmin G600 TXi",
    r"\bGDL[\s\-]?69A\b": "Garmin GDL 69A Datalink",
    r"\bGDL[\s\-]?69\b": "Garmin GDL 69 Datalink",
    r"\bGDL[\s\-]?49\b": "Garmin GDL 49 Datalink",
    r"\bGDL[\s\-]?50R\b": "Garmin GDL 50R",
    r"\bGDL[\s\-]?50\b": "Garmin GDL 50",
    r"\bGDL[\s\-]?51R\b": "Garmin GDL 51R",
    r"\bGDL[\s\-]?51\b": "Garmin GDL 51",
    r"\bGDL[\s\-]?52\b": "Garmin GDL 52",
    r"\bGDL[\s\-]?39R\b": "Garmin GDL 39R",
    r"\bGDL[\s\-]?393D\b": "Garmin GDL 393D",
    r"\bGDL[\s\-]?60\b": "Garmin GDL 60 Datalink",
    r"\bGDL[\s\-]?39\b": "Garmin GDL 39",
    r"\bGDL[\s\-]?88\b": "Garmin GDL 88",
    r"\bGDL[\s\-]?82\b": "Garmin GDL 82",
    r"\bTAWS[\s\-]?B\b": "TAWS-B",
    r"\bSVT\b": "Synthetic Vision (SVT)",
    r"\bESP\b": "Electronic Stability Protection (ESP)",
    r"\bKX[\s\-]?155A?\b": "Bendix/King KX 155",
    r"\bKX[\s\-]?155S\b": "Bendix/King KX 155S",
    r"\bKX[\s\-]?155B\b": "Bendix/King KX 155B",
    r"\bKX[\s\-]?165A\b": "Bendix/King KX 165A",
    r"\bKX[\s\-]?125\b": "Bendix/King KX 125",
    r"\bKLN[\s\-]?94\b": "Bendix/King KLN 94",
    r"\bKLN[\s\-]?94B\b": "Bendix/King KLN 94B",
    r"\bKLN[\s\-]?90B\b": "Bendix/King KLN 90B",
    r"\bKLN[\s\-]?90A\b": "Bendix/King KLN 90A",
    r"\bKLN[\s\-]?90\b": "Bendix/King KLN 90",
    r"\bKLN[\s\-]?89B\b": "Bendix/King KLN 89B",
    r"\bKLN[\s\-]?89\b": "Bendix/King KLN 89",
    r"\bKLN[\s\-]?35A\b": "Bendix/King KLN 35A",
    r"\bKLN[\s\-]?62A\b": "Bendix/King KLN 62A",
    r"\bKLN[\s\-]?900\b": "Bendix/King KLN 900",
    r"\bKAP[\s\-]?150\b": "Bendix/King KAP 150",
    r"\bKX[\s\-]?170\s*B\b": "Bendix/King KX 170B",
    r"\bKX[\s\-]?170\b": "Bendix/King KX 170",
    r"\bKX[\s\-]?175\s*B\b": "Bendix/King KX 175B",
    r"\bKX[\s\-]?165\b": "Bendix/King KX 165",
    r"\bKX[\s\-]?76A\b": "Bendix/King KX 76A",
    r"\bKFC[\s\-]?225\b": "Bendix/King KFC 225",
    r"\bKFC[\s\-]?150\b": "Bendix/King KFC 150",
    r"\bKFC[\s\-]?200\b": "Bendix/King KFC 200",
    r"\bKFC[\s\-]?325\b": "Bendix/King KFC 325",
    r"\bGNS[\s\-]?480\b": "Garmin GNS 480",
    r"\bKAS[\s\-]?297B\b": "Honeywell KAS 297B",
    r"\bSTEC[\s\-]?30\b|\bS[\s\-]?TEC[\s\-]?30\b": "S-TEC 30 Autopilot",
    r"\bSTEC[\s\-]?20\b|\bS[\s\-]?TEC[\s\-]?20\b": "S-TEC 20 Autopilot",
    r"\bSTEC[\s\-]?30A\b|\bS[\s\-]?TEC[\s\-]?30A\b": "S-TEC 30A Autopilot",
    r"\bSTEC[\s\-]?36\b|\bS[\s\-]?TEC[\s\-]?36\b": "S-TEC 36 Autopilot",
    r"\bSTEC[\s\-]?50\b|\bS[\s\-]?TEC[\s\-]?50\b": "S-TEC 50 Autopilot",
    r"\bSTEC[\s\-]?55X?\b|\bS[\s\-]?TEC[\s\-]?55X?\b": "S-TEC 55 Autopilot",
    r"\bSTEC[\s\-]?40\b|\bS[\s\-]?TEC[\s\-]?40\b": "S-TEC 40 Autopilot",
    r"\bSTEC[\s\-]?60(?:-?2)?\b|\bS[\s\-]?TEC[\s\-]?60(?:-?2)?\b": "S-TEC 60-2 Autopilot",
    r"\bSTEC[\s\-]?2100\b|\bS[\s\-]?TEC[\s\-]?2100\b": "S-TEC 2100 Autopilot",
    r"\bSTEC[\s\-]?65W\b|\bS[\s\-]?TEC[\s\-]?65W\b": "S-TEC 65W Autopilot",
    r"\bSTEC[\s\-]?65\b|\bS[\s\-]?TEC[\s\-]?65\b": "S-TEC 65 Autopilot",
    r"\bSTEC[\s\-]?180\b|\bS[\s\-]?TEC[\s\-]?180\b": "S-TEC 180 Autopilot",
    r"\bSTEC[\s\-]?1972\b|\bS[\s\-]?TEC[\s\-]?1972\b": "S-TEC 1972 Autopilot",
    r"\bSTEC[\s\-]?1977\b|\bS[\s\-]?TEC[\s\-]?1977\b": "S-TEC 1977 Autopilot",
    r"\bSTEC[\s\-]?1979\b|\bS[\s\-]?TEC[\s\-]?1979\b": "S-TEC 1979 Autopilot",
    r"\bSTEC[\s\-]?1981\b|\bS[\s\-]?TEC[\s\-]?1981\b": "S-TEC 1981 Autopilot",
    r"\bSTEC[\s\-]?360\b|\bS[\s\-]?TEC[\s\-]?360\b": "S-TEC 360 Autopilot",
    r"\bSTEC[\s\-]?361\b|\bS[\s\-]?TEC[\s\-]?361\b": "S-TEC 361 Autopilot",
    r"\bNGT[\s\-]?9000\b": "L3Harris NGT-9000 ADS-B",
    r"\bNGT[\s\-]?900\b": "L3Harris NGT-900 ADS-B",
    r"\bGPS[\s\-]?496\b": "Garmin GPS 496",
    r"\bGPS[\s\-]?150\b": "Garmin GPS 150",
    r"\bGPS[\s\-]?215\b": "Garmin GPS 215",
    r"\bGPS[\s\-]?396\b": "Garmin GPS 396",
    r"\bGPS[\s\-]?430\b": "Garmin GPS 430",
    r"\bGPS[\s\-]?500\b": "Garmin GPS 500",
    r"\bGPS[\s\-]?660\b": "Garmin GPS 660",
    r"\bGPS[\s\-]?695\b": "Garmin GPS 695",
    r"\bGPS[\s\-]?696\b": "Garmin GPS 696",
    r"\bGPS[\s\-]?796\b": "Garmin GPS 796",
    r"\bPMA[\s\-]?7000B\b": "PS Engineering PMA7000B",
    r"\bPMA[\s\-]?8000G\b": "PS Engineering PMA8000G",
    r"\bPMA[\s\-]?8000B\b": "PS Engineering PMA8000B",
    r"\bPMA[\s\-]?8000\b": "PS Engineering PMA8000",
    r"\bPMA[\s\-]?8000C\b": "PS Engineering PMA8000C",
    r"\bPMA[\s\-]?7000\b": "PS Engineering PMA7000",
    r"\bPMA[\s\-]?700B\b": "PS Engineering PMA700B",
    r"\bPMA[\s\-]?6000M\b": "PS Engineering PMA6000M",
    r"\bPMA[\s\-]?7000M\b": "PS Engineering PMA7000M",
    r"\bPMA[\s\-]?6000B\b": "PS Engineering PMA6000B",
    r"\bPMA[\s\-]?600B\b": "PS Engineering PMA600B",
    r"\bPMA[\s\-]?6000\b": "PS Engineering PMA6000",
    r"\bPMA[\s\-]?340\b": "PS Engineering PMA340",
    r"\bPMA[\s\-]?1000\b": "PS Engineering PMA1000",
    r"\bPMA[\s\-]?7000H\b": "PS Engineering PMA7000H",
    r"\bPMA[\s\-]?8000M\b": "PS Engineering PMA8000M",
    r"\bPMA[\s\-]?459B\b": "PS Engineering PMA459B",
    r"\bPMA[\s\-]?450C\b": "PS Engineering PMA450C",
    r"\bPMA[\s\-]?450A\b": "PS Engineering PMA450A",
    r"\bPMA[\s\-]?450B?\b": "PS Engineering PMA 450B",
    r"\bGTC[\s\-]?345\b": "Garmin GTC 345 Controller",
    r"\bGTC[\s\-]?575\b": "Garmin GTC 575 Controller",
    r"\bGMA[\s\-]?245\b": "Garmin GMA 245 Audio Panel",
    r"\bGMA[\s\-]?3659\b": "Garmin GMA 3659 Audio Panel",
    r"\bGRS[\s\-]?56\b": "Garmin GRS 56 AHRS",
    r"\bGRS[\s\-]?72\b": "Garmin GRS 72 AHRS",
    r"\bGMU[\s\-]?22\b": "Garmin GMU 22 Magnetometer",
    r"\bGNS[\s\-]?420\b": "Garmin GNS 420",
    r"\bGNS[\s\-]?500\b": "Garmin GNS 500",
    r"\bGNS[\s\-]?625\b": "Garmin GNS 625",
    r"\bGNS[\s\-]?400\b": "Garmin GNS 400",
    r"\bGNS[\s\-]?750\b": "Garmin GTN 750",
    r"\bGTN[\s\-]?430\b": "Garmin GNS 430",
    r"\bGTN[\s\-]?327\b": "Garmin GTN 327",
    r"\bGTN[\s\-]?725\b": "Garmin GTN 725",
    r"\bGTN[\s\-]?740(?:\s*XI|XI)\b": "Garmin GTN 740Xi",
    r"\bGTC[\s\-]?580\b": "Garmin GTC 580 Controller",
    r"\bGDC[\s\-]?31\b": "Garmin GDC 31 Air Data Computer",
    r"\bGDL[\s\-]?52R\b": "Garmin GDL 52R",
}

MODS_MAP: dict[str, str] = {
    r"\bOsborne\s+tip\s+tanks\b|\btip\s+tanks\b": "Tip Tanks",
    r"\bRAM\s+conversion\b": "RAM Engine Conversion",
    r"\bturbo[\s\-]?normalized\b|\bTurbo[\s\-]?Normaliz(?:ed|ing)\b|\bTN\b": "Turbo Normalizing",
    r"\bRobertson\s+STOL\b": "Robertson STOL Kit",
    r"\bHorton\s+STOL\b": "Horton STOL Kit",
    r"\bspeed\s+brakes\b": "Speed Brakes",
    r"\bKnots\s*2U\b": "Knots 2U Speed Mods",
}


def _normalize_text(text: str) -> str:
    return " ".join((text or "").replace("\u00a0", " ").split())


def _int_from_number_text(number_text: str) -> int | None:
    try:
        return int(number_text.replace(",", ""))
    except (TypeError, ValueError):
        return None


def _float_from_number_text(number_text: str) -> float | None:
    try:
        return float(number_text.replace(",", ""))
    except (TypeError, ValueError):
        return None


def sanitize_engine_model(value: str | None) -> str | None:
    if not value:
        return None
    text = _normalize_text(value)
    if not text:
        return None

    # Reject obvious non-model narratives that occasionally leak from spec blocks.
    if re.match(r"^(?:\d{1,6}\s+)?since\s+new\b", text, flags=re.IGNORECASE):
        return None
    if re.match(r"^\d{1,6}\s+since\s+new\b", text, flags=re.IGNORECASE):
        return None

    # Strip obvious trailing narrative fragments that are not part of engine model.
    cut_markers = [
        r"\s[-|]\s*\d{2,7}\s*(?:tt|hours?|hrs?)\b",
        r"\b\d{2,7}\s*tt(?:af)?\b",
        r"\bsince\s+new\b",
        r"\bannual(?:\s+inspection)?\b",
        r"\bavionics\b",
        r"\badditional\s+equipment\b",
        r"\bexceptional\s+features\b",
        r"\bupgrades?\b",
        r"\bno\s+damage\s+history\b",
    ]
    earliest_cut: int | None = None
    for marker in cut_markers:
        match = re.search(marker, text, flags=re.IGNORECASE)
        if match:
            if earliest_cut is None or match.start() < earliest_cut:
                earliest_cut = match.start()

    if earliest_cut is not None and earliest_cut > 8:
        text = text[:earliest_cut].strip(" -:;,")

    if len(text) > 110:
        sentence_cut = re.search(r"[.;]", text[40:])
        if sentence_cut:
            text = text[: 40 + sentence_cut.start()].strip(" -:;,")
        else:
            text = text[:110].rsplit(" ", 1)[0].strip(" -:;,")

    if not text:
        return None
    has_engine_token = bool(
        re.search(
            r"\b(?:lycoming|continental|pratt\s*&\s*whitney|rotax|tsio|tio|io[\- ]\d|o[\- ]\d|aeio|go[\- ]\d|l?tsio|pt6|rr)\b",
            text,
            flags=re.IGNORECASE,
        )
    )
    if not has_engine_token and re.search(
        r"\b(?:interior|exterior|avionics|useful\s*load|top\s*overhaul|cylinders|annual)\b",
        text,
        flags=re.IGNORECASE,
    ):
        return None
    if re.fullmatch(r"(unknown|n/?a|none|-+)", text, flags=re.IGNORECASE):
        return None
    return text


def extract_engine_model(text: str) -> str | None:
    src = _normalize_text(text)
    if not src:
        return None

    labeled_patterns = [
        r"\b(?:engine\s*(?:1\s*)?(?:make/model|model)?|powerplant)\s*[:\-]\s*([^.;]{6,220})",
        r"\b(?:engine\s*(?:1\s*)?(?:make/model|model)?|powerplant)\s+([^.;]{6,220})",
    ]
    for pattern in labeled_patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        cleaned = sanitize_engine_model(match.group(1))
        if cleaned:
            return cleaned

    make_model_match = re.search(
        r"\b((?:Lycoming|Continental|Pratt\s*&\s*Whitney|Rotax)\s+[A-Z0-9][A-Z0-9\-/]*(?:\s*\([^)]+\))?)",
        src,
        flags=re.IGNORECASE,
    )
    if make_model_match:
        return sanitize_engine_model(make_model_match.group(1))

    standalone_model_match = re.search(
        r"\b((?:TSIO|TIO|IO|O|AEIO|GO|LTSIO|PT6A|RR)\-?[A-Z0-9]{2,}(?:\-[A-Z0-9]{1,4})?)\b",
        src,
        flags=re.IGNORECASE,
    )
    if standalone_model_match:
        return sanitize_engine_model(standalone_model_match.group(1))
    return None


def extract_times(text: str) -> dict[str, int]:
    src = _normalize_text(text)
    out: dict[str, int] = {}

    patterns = {
        "total_time": [
            r"\bTTAF\s*[:\-]?\s*([\d,]{2,7})\b",
            r"\b([\d,]{2,7})\s*TT\b",
            r"\b([\d,]{2,7})\s*TTAF\b",
            r"\b([\d,]{2,7})\s*total\s*time\b",
        ],
        "engine_smoh": [
            r"\b([\d,]{2,7})\s*SMOH\b",
            r"\b([\d,]{2,7})\s*SRAM\b",
            r"\b([\d,]{2,7})\s*since\s*major\b",
            r"\bSMOH\s*[:\-]?\s*([\d,]{2,7})\b",
        ],
        "prop_spoh": [
            r"\b([\d,]{2,7})\s*SPOH\b",
            r"\b([\d,]{2,7})\s*since\s*prop\s*overhaul\b",
        ],
        "engine_stop": [
            r"\b([\d,]{2,7})\s*since\s*top\b",
            r"\b([\d,]{2,7})\s*STOP\b",
        ],
    }

    for key, key_patterns in patterns.items():
        for pattern in key_patterns:
            match = re.search(pattern, src, flags=re.IGNORECASE)
            if not match:
                continue
            value = _int_from_number_text(match.group(1))
            if value is not None:
                out[key] = value
                break
    return out


def extract_cylinder_time_since_new(text: str) -> int | None:
    src = _normalize_text(text)
    patterns = [
        r"\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+new\s+cylinders?\b",
        r"\bcylinders?\b[^.]{0,80}\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+new\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if match:
            return _int_from_number_text(match.group(1))
    return None


def extract_hours_since_iran(text: str) -> int | None:
    src = _normalize_text(text)
    match = re.search(r"\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+IRAN\b", src, flags=re.IGNORECASE)
    if not match:
        return None
    return _int_from_number_text(match.group(1))


def extract_last_annual_inspection(text: str) -> str | None:
    src = _normalize_text(text)
    patterns = [
        r"\bannual(?:\s+inspection)?\s*[:\-]?\s*(?:completed\s*)?(?:in\s*)?([A-Za-z]{3,9}\s+\d{4})\b",
        r"\bannual(?:\s+inspection)?\s*[:\-]?\s*(\d{1,2}/\d{4})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        value = _normalize_text(match.group(1))
        if value:
            return value
    return None


def extract_avionics(text: str) -> list[str]:
    detailed = extract_avionics_detailed(text)
    return sorted({str(item.get("canonical_name")) for item in detailed if item.get("canonical_name")})


def _infer_quantity(window_text: str) -> int:
    window = _normalize_text(window_text).lower()
    if not window:
        return 1
    # Highest confidence explicit multipliers first.
    mult = re.search(r"\b([2-4])\s*[xX]\b", window)
    if mult:
        return int(mult.group(1))
    if re.search(r"\bpair\b", window):
        return 2
    if re.search(r"\bdual\b|\btwo\b", window):
        return 2
    if re.search(r"\btriple\b|\bthree\b", window):
        return 3
    if re.search(r"\bquad\b|\bfour\b", window):
        return 4
    return 1


def extract_avionics_detailed(text: str) -> list[dict[str, Any]]:
    src = _normalize_text(text)
    if not src:
        return []

    aggregated: dict[str, dict[str, Any]] = {}

    def _record_match(canonical_name: str, matched_text: str, context_text: str) -> None:
        quantity = _infer_quantity(context_text)
        entry = aggregated.setdefault(
            canonical_name,
            {
                "canonical_name": canonical_name,
                "quantity": 1,
                "confidence": 0.95,
                "match_type": "regex_alias",
                "matched_texts": [],
            },
        )
        entry["quantity"] = max(int(entry.get("quantity") or 1), quantity)
        texts = entry["matched_texts"]
        if len(texts) < 5:
            texts.append(matched_text)

    # Handle common combo shorthand so both units are counted.
    combo_pattern = r"\b(?:garmin\s*)?(?:gtn\s*)?(650\s*/\s*750|750\s*/\s*650)\b"
    for combo in re.finditer(combo_pattern, src, flags=re.IGNORECASE):
        start = max(0, combo.start() - 18)
        end = min(len(src), combo.end() + 18)
        context = src[start:end]
        _record_match("Garmin GTN 650", combo.group(0), context)
        _record_match("Garmin GTN 750", combo.group(0), context)

    for pattern, canonical_name in AVIONICS_MAP.items():
        for match in re.finditer(pattern, src, flags=re.IGNORECASE):
            start = max(0, match.start() - 18)
            end = min(len(src), match.end() + 18)
            context = src[start:end]
            _record_match(canonical_name, match.group(0), context)

    return sorted(aggregated.values(), key=lambda row: str(row.get("canonical_name") or ""))


def extract_avionics_unresolved(text: str, matched: list[dict[str, Any]] | None = None) -> list[str]:
    src = _normalize_text(text)
    if not src:
        return []

    def _compact(value: str) -> str:
        return re.sub(r"[^A-Za-z0-9]+", "", str(value or "").upper())

    def _resolved_token_variants(value: str) -> set[str]:
        compact = _compact(value)
        if not compact:
            return set()
        variants = {compact}
        for token in TOKEN_CANDIDATE_RE.findall(str(value or "").upper()):
            tok_compact = _compact(token)
            if tok_compact:
                variants.add(tok_compact)
        if compact.endswith("XI") and len(compact) > 6:
            variants.add(compact[:-2])
        if compact.endswith(("A", "B", "C", "D", "G", "M", "R", "W")) and len(compact) > 5:
            variants.add(compact[:-1])
        if compact.startswith("STEC60"):
            variants.add("STEC60")
        if compact.startswith("GTN650"):
            variants.add("GTN650")
        if compact.startswith("KX165"):
            variants.add("KX165")
        if compact.startswith("KX155"):
            variants.add("KX155")
        if compact.startswith("PMA450"):
            variants.add("PMA450")
            variants.add("PMA450B")
        return {token for token in variants if token}

    matched = matched or []
    resolved_tokens: set[str] = set()
    for item in matched:
        canonical_name = str(item.get("canonical_name") or "")
        for token in _resolved_token_variants(canonical_name):
            resolved_tokens.add(token)
        for token in item.get("matched_texts", []):
            for variant in _resolved_token_variants(str(token)):
                resolved_tokens.add(variant)

    candidates = TOKEN_CANDIDATE_RE.findall(src.upper())
    deny = {
        "TT",
        "TTAF",
        "SMOH",
        "SPOH",
        "STOP",
        "ADSB",
        "ADSBOUT",
        "ADSBIN",
        "SVT",
        "ESP",
        "TAWSB",
        "GTN750",
        "GTX345R",
    }
    unresolved: set[str] = set()
    for raw in candidates:
        compact = _compact(raw)
        if not compact or compact in deny:
            continue
        if compact in resolved_tokens:
            continue
        if len(compact) >= 5 and any(
            token.startswith(compact) or compact.startswith(token) for token in resolved_tokens
        ):
            continue
        # Ignore short numeric fragments that slip through.
        if compact.isdigit() or len(compact) < 4:
            continue
        unresolved.add(compact)
    return sorted(unresolved)


def extract_mods_and_stcs(text: str) -> list[str]:
    src = _normalize_text(text)
    matched: set[str] = set()
    for pattern, canonical_name in MODS_MAP.items():
        if re.search(pattern, src, flags=re.IGNORECASE):
            matched.add(canonical_name)
    return sorted(matched)


def extract_useful_load(text: str) -> int | None:
    src = _normalize_text(text)
    patterns = [
        r"\b([\d,]{2,5})\s*useful\s*load\b",
        r"\buseful\s*load\s*[:\-]?\s*([\d,]{2,5})\b",
        r"\bUL\s*[:\-]?\s*([\d,]{2,5})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        value = _int_from_number_text(match.group(1))
        if value is not None:
            return value
    return None


def extract_fuel_capacity(text: str) -> int | None:
    src = _normalize_text(text)
    patterns = [
        r"\b([\d,]{2,4})\s*gal(?:lons?)?\s*usable\b",
        r"\btotal\s*fuel\s*[:\-]?\s*([\d,]{2,4})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        value = _int_from_number_text(match.group(1))
        if value is not None:
            return value
    return None


def extract_special_equipment(text: str) -> dict[str, bool]:
    src = _normalize_text(text).lower()
    equipment: dict[str, bool] = {}
    if re.search(r"\boxygen\b|\bo2\b|\btat\b", src):
        equipment["oxygen_system"] = True
    if re.search(r"\btks\b|\bboots\b|\bde[\s\-]?ice\b", src):
        equipment["known_ice"] = True
    if re.search(r"\bair\s*conditioning\b|\ba\/c\b", src):
        equipment["air_conditioning"] = True
    if re.search(r"\bengine\s*pre[\s\-]?heat\b", src):
        equipment["engine_pre_heat"] = True
    if re.search(r"\bco\s*detector\b|\bpulse\s*oximeter\b", src):
        equipment["safety_monitoring_equipment"] = True
    return equipment


def extract_fractional_pricing(text: str, observed_price: int | float | None = None) -> dict[str, Any]:
    src = _normalize_text(text)
    payload: dict[str, Any] = {
        "is_fractional": False,
        "share_numerator": None,
        "share_denominator": None,
        "share_percent": None,
        "share_price": None,
        "normalized_full_price": None,
        "review_needed": False,
        "evidence": [],
    }
    if not src:
        return payload

    evidence: list[str] = []
    numerator: int | None = None
    denominator: int | None = None
    share_percent: float | None = None

    ratio_match = re.search(r"\b(\d{1,2})\s*/\s*(\d{1,3})(?:st|nd|rd|th)?\b", src, flags=re.IGNORECASE)
    if ratio_match:
        ratio_text = ratio_match.group(0)
        window_start = max(0, ratio_match.start() - 50)
        window_end = min(len(src), ratio_match.end() + 50)
        context_window = src[window_start:window_end]
        if re.search(
            r"\b(?:partnership|fractional|ownership|co[\-\s]?ownership|share|member(?:ship)?\s+interest|interest)\b",
            context_window,
            flags=re.IGNORECASE,
        ):
            numerator = int(ratio_match.group(1))
            denominator = int(ratio_match.group(2))
            evidence.append(ratio_text)

    if numerator is None or denominator is None:
        ordinal_match = re.search(
            r"\b(\d{1,3})(?:st|nd|rd|th)\s+(?:partnership|ownership|share|interest)\b",
            src,
            flags=re.IGNORECASE,
        )
        if ordinal_match:
            numerator = 1
            denominator = int(ordinal_match.group(1))
            evidence.append(ordinal_match.group(0))

    if numerator is None or denominator is None:
        percent_match = re.search(
            r"\b(\d{1,2}(?:\.\d+)?)\s*%\s*(?:ownership|share|interest)\b",
            src,
            flags=re.IGNORECASE,
        )
        if percent_match:
            percent_val = _float_from_number_text(percent_match.group(1))
            if percent_val is not None and 0 < percent_val < 100:
                share_percent = round(percent_val, 3)
                fraction = percent_val / 100.0
                reciprocal = 1.0 / fraction
                rounded_reciprocal = round(reciprocal)
                if abs(reciprocal - rounded_reciprocal) <= 0.01 and rounded_reciprocal >= 2:
                    numerator = 1
                    denominator = int(rounded_reciprocal)
                evidence.append(percent_match.group(0))

    money_matches = list(re.finditer(r"\$\s*([\d,]{2,9})\b", src))
    inferred_share_price: int | None = None
    if money_matches:
        target_idx = None
        if ratio_match:
            target_idx = ratio_match.start()
        elif evidence:
            token = evidence[0]
            token_idx = src.lower().find(token.lower())
            target_idx = token_idx if token_idx >= 0 else None
        if target_idx is not None:
            closest = min(money_matches, key=lambda m: abs(m.start() - target_idx))
            inferred_share_price = _int_from_number_text(closest.group(1))
        else:
            inferred_share_price = _int_from_number_text(money_matches[0].group(1))

    if inferred_share_price is None and isinstance(observed_price, (int, float)) and observed_price > 0:
        inferred_share_price = int(round(float(observed_price)))

    normalized_full_price: int | None = None
    if (
        inferred_share_price is not None
        and numerator is not None
        and denominator is not None
        and denominator > 0
        and numerator > 0
        and denominator > numerator
    ):
        normalized_full_price = int(round((float(inferred_share_price) * float(denominator)) / float(numerator)))

    strong_fractional_term = re.search(
        r"\b(?:fractional\s+ownership|fractional|partnership|co[\-\s]?ownership|ownership\s+interest|share\s+available|member(?:ship)?\s+interest)\b",
        src,
        flags=re.IGNORECASE,
    )
    has_explicit_fraction = numerator is not None and denominator is not None and denominator > 1

    payload["is_fractional"] = has_explicit_fraction
    payload["share_numerator"] = numerator
    payload["share_denominator"] = denominator
    payload["share_percent"] = share_percent
    payload["share_price"] = inferred_share_price
    payload["normalized_full_price"] = normalized_full_price
    payload["review_needed"] = bool(strong_fractional_term and not has_explicit_fraction)
    payload["evidence"] = evidence[:3]
    return payload


def parse_description(text: str, observed_price: int | float | None = None) -> dict[str, Any]:
    src = _normalize_text(text)
    times = extract_times(src)
    avionics_detailed = extract_avionics_detailed(src)
    avionics = extract_avionics(src)
    avionics_unresolved = extract_avionics_unresolved(src, avionics_detailed)
    mods = extract_mods_and_stcs(src)
    useful_load = extract_useful_load(src)
    fuel_capacity = extract_fuel_capacity(src)
    special_equipment = extract_special_equipment(src)
    pricing_context = extract_fractional_pricing(src, observed_price=observed_price)
    engine_model = extract_engine_model(src)
    cylinders_since_new = extract_cylinder_time_since_new(src)
    hours_since_iran = extract_hours_since_iran(src)
    last_annual_inspection = extract_last_annual_inspection(src)

    engine_payload = {
        "model": engine_model,
        "smoh": times.get("engine_smoh"),
        "tt": times.get("total_time"),
        "spoh": times.get("prop_spoh"),
        "stop": times.get("engine_stop"),
    }
    engine_payload = {k: v for k, v in engine_payload.items() if v is not None}

    maintenance_payload: dict[str, Any] = {}
    if cylinders_since_new is not None:
        maintenance_payload["cylinders_since_new_hours"] = cylinders_since_new
        times["cylinders_since_new_hours"] = cylinders_since_new
    if hours_since_iran is not None:
        maintenance_payload["hours_since_iran"] = hours_since_iran
        times["hours_since_iran"] = hours_since_iran
    if last_annual_inspection:
        maintenance_payload["last_annual_inspection"] = last_annual_inspection

    evidence_count = 0
    evidence_count += len(engine_payload)
    evidence_count += len(avionics_detailed)
    evidence_count += len(mods)
    evidence_count += 1 if useful_load is not None else 0
    evidence_count += 1 if fuel_capacity is not None else 0
    evidence_count += len(special_equipment)
    evidence_count += len(maintenance_payload)
    evidence_count += 1 if pricing_context.get("is_fractional") else 0
    confidence = round(min(1.0, 0.2 + evidence_count * 0.08), 2) if src else 0.0

    payload: dict[str, Any] = {
        "engine": engine_payload,
        "mods": mods,
        "avionics": avionics,
        "avionics_detailed": avionics_detailed,
        "avionics_unresolved": avionics_unresolved,
        "useful_load_lbs": useful_load,
        "fuel_capacity_gal": fuel_capacity,
        "special_equipment": special_equipment,
        "pricing_context": pricing_context,
        "maintenance": maintenance_payload,
        "confidence": confidence,
        "avionics_parser_version": PARSER_VERSION,
    }
    payload["times"] = times
    return payload

