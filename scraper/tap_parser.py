from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from description_parser import sanitize_engine_model

BASE_URL = "https://www.trade-a-plane.com"


def _to_int(text: str | None) -> int | None:
    if not text:
        return None
    match = re.search(r"(\d[\d,]*)", text)
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _norm_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _extract_label_value(spec_key: str, blocks: dict[str, str]) -> str | None:
    return blocks.get(spec_key.lower()) or blocks.get(spec_key.lower().rstrip(":"))


def _is_tap_listing_image(url: str) -> bool:
    low = (url or "").lower()
    if not ("cloudfront.net" in low or "dsgiipnwy" in low):
        return False
    deny = ("_common", "ajax_loader", "logo", "chicklet", "print", "email")
    return not any(token in low for token in deny)


def parse_list_card(card_soup) -> dict | None:
    source_listing_id = str(card_soup.get("data-listing_id") or "").strip()
    seller_id = str(card_soup.get("data-seller_id") or "").strip() or None
    cat_text = str(card_soup.get("data-cat") or "").strip()

    link = card_soup.select_one("a.log_listing_click[href]") or card_soup.select_one("a#title[href]")
    if not source_listing_id or link is None:
        return None
    href = str(link.get("href") or "").strip()
    if not href:
        return None
    url = urljoin(BASE_URL, href)
    title = _norm_text(link.get_text(" ", strip=True))
    if not title:
        return None

    price_text = _norm_text((card_soup.select_one(".txt-price") or {}).get_text(" ", strip=True) if card_soup.select_one(".txt-price") else "")
    price_asking = _to_int(price_text.replace("$", "").replace(",", "").replace(" ", ""))

    n_number = None
    reg_el = card_soup.select_one(".txt-reg-num")
    if reg_el is not None:
        reg_text = _norm_text(reg_el.get_text(" ", strip=True)).replace("Reg#", "").strip().upper()
        n_match = re.search(r"[A-Z]\d{1,5}[A-Z]{0,2}", reg_text)
        if n_match:
            n_number = n_match.group(0)

    tt_el = card_soup.select_one(".txt-total-time")
    total_time_airframe = _to_int(_norm_text(tt_el.get_text(" ", strip=True)).replace("TT:", "")) if tt_el else None

    desc_el = card_soup.select_one("p.description")
    description = _norm_text(desc_el.get_text(" ", strip=True)) if desc_el else None

    img_el = card_soup.select_one("div.img_area img[src]")
    primary_image_url = str(img_el.get("src") or "").strip() if img_el else None

    return {
        "source_site": "trade_a_plane",
        "source": "trade_a_plane",
        "listing_source": "trade_a_plane",
        "source_id": f"tap_{source_listing_id}",
        "source_listing_id": source_listing_id,
        "seller_id": seller_id,
        "aircraft_type": _normalize_aircraft_type(cat_text),
        "title": title,
        "url": url,
        "price_asking": price_asking,
        "asking_price": price_asking,
        "n_number": n_number,
        "total_time_airframe": total_time_airframe,
        "description": description,
        "primary_image_url": primary_image_url,
    }


def _normalize_aircraft_type(cat_text: str) -> str:
    mapping = {
        "Single Engine Piston": "single_engine_piston",
        "Multi Engine Piston": "multi_engine_piston",
        "Turboprop": "turboprop",
        "Jets": "jet",
        "Turbine Helicopters": "turbine_helicopter",
        "Piston Helicopters": "piston_helicopter",
        "Light Sport": "light_sport",
        "Experimental": "experimental",
        "Amphibious/Floatplane": "amphibious_float",
    }
    return mapping.get(_norm_text(cat_text), "single_engine_piston")


def parse_spec_blocks(soup: BeautifulSoup) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in soup.select(".btm-detail-box p"):
        label = p.select_one("label")
        if not label:
            continue
        key = _norm_text(label.get_text(" ", strip=True)).rstrip(":").lower()
        full = _norm_text(p.get_text(" ", strip=True))
        value = _norm_text(full.replace(_norm_text(label.get_text(" ", strip=True)), "", 1))
        if key:
            out[key] = value
    return out


def parse_detail_page(html: str, source_id: str, listing_url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    output: dict[str, Any] = {
        "source_site": "trade_a_plane",
        "source_id": source_id,
        "url": listing_url,
        "_extraction_version": "tap_parser_v2",
    }

    summary = soup.select_one("div.desktop-v")
    summary_text = _norm_text(summary.get_text(" ", strip=True) if summary else "")
    if summary_text:
        year_match = re.search(r"Year:\s*(\d{4})", summary_text, flags=re.I)
        if year_match:
            output["year"] = int(year_match.group(1))
        mm_match = re.search(r"Make/Model:\s*([A-Z0-9].*?)(?:Registration|Serial|Location|$)", summary_text, flags=re.I)
        if mm_match:
            mm = _norm_text(mm_match.group(1))
            parts = mm.split(" ", 1)
            if parts:
                output["make"] = parts[0].title()
                output["model"] = parts[1].strip() if len(parts) > 1 else None
        reg_match = re.search(r"Registration #:\s*([A-Z]\d[\w]{0,6})", summary_text, flags=re.I)
        if reg_match:
            output["n_number"] = reg_match.group(1).upper()
        serial_match = re.search(r"Serial #:\s*([^\n\r]+?)(?:Location:|$)", summary_text, flags=re.I)
        if serial_match:
            serial = _norm_text(serial_match.group(1))
            if serial and "not listed" not in serial.lower():
                output["serial_number"] = serial
        loc_match = re.search(r"Location:\s*([^\n\r]+)", summary_text, flags=re.I)
        if loc_match:
            loc = _norm_text(loc_match.group(1)).replace(" , ", ", ")
            output["location_raw"] = loc
            parts = [p.strip() for p in loc.split(",") if p.strip()]
            if len(parts) >= 2:
                output["location_city"] = parts[0]
                state = parts[1].split(" ")[0].upper()
                if re.fullmatch(r"[A-Z]{2}", state):
                    output["state"] = state

    price_el = soup.select_one("[itemprop=price]")
    if price_el is not None:
        value = _to_int(_norm_text(price_el.get_text(strip=True)))
        if value is not None:
            output["price_asking"] = value
            output["asking_price"] = value

    spec_blocks = parse_spec_blocks(soup)
    tt = _extract_label_value("Total Time", spec_blocks)
    if tt is not None:
        parsed = _to_int(tt)
        if parsed is not None:
            output["total_time_airframe"] = parsed
    eng1 = _extract_label_value("Engine 1 Time", spec_blocks)
    eng2 = _extract_label_value("Engine 2 Time", spec_blocks)
    prop1 = _extract_label_value("Prop 1 Time", spec_blocks)
    prop2 = _extract_label_value("Prop 2 Time", spec_blocks)
    if eng1 is not None:
        v = _to_int(eng1)
        if v is not None:
            output["time_since_overhaul"] = v
            output["engine_time_since_overhaul"] = v
    if eng2 is not None:
        v = _to_int(eng2)
        if v is not None:
            output["second_engine_time_since_overhaul"] = v
    if prop1 is not None:
        v = _to_int(prop1)
        if v is not None:
            output["time_since_prop_overhaul"] = v
    if prop2 is not None:
        v = _to_int(prop2)
        if v is not None:
            output["second_time_since_prop_overhaul"] = v
    seats = _extract_label_value("# of Seats", spec_blocks)
    if seats:
        output["num_seats"] = _to_int(seats)
    useful = _extract_label_value("Useful Load", spec_blocks)
    if useful:
        output["useful_load_lbs"] = _to_int(useful)
    flight_rules = _extract_label_value("Flight Rules", spec_blocks)
    if flight_rules:
        output["flight_rules"] = _norm_text(flight_rules)
    condition = _extract_label_value("Condition", spec_blocks)
    if condition:
        output["condition_text"] = _norm_text(condition)
    year_painted = _extract_label_value("Year Painted", spec_blocks)
    if year_painted:
        output["year_painted"] = _to_int(year_painted)
    year_interior = _extract_label_value("Interior Year", spec_blocks)
    if year_interior:
        output["year_interior"] = _to_int(year_interior)

    detailed_desc_text = ""
    avionics_text = ""
    engines_text = ""
    remarks_text = ""
    interior_text = ""
    for box in soup.select(".btm-detail-box"):
        box_id = str(box.get("id") or "")
        text = _norm_text(box.get_text(" ", strip=True))
        if box_id == "detailed_desc":
            detailed_desc_text = text
        elif box_id == "avionics_equipment":
            avionics_text = re.sub(r"^Avionics\s*/\s*Equipment\s*", "", text, flags=re.I).strip()
        elif box_id == "engines_mods":
            engines_text = text
            output["engine_model"] = sanitize_engine_model(text)
        elif box_id == "remarks":
            remarks_text = text
        elif box_id == "interior_exterior":
            interior_text = text

    if avionics_text:
        output["avionics_description"] = avionics_text
    combined_desc = " ".join(part for part in [detailed_desc_text, remarks_text] if part).strip()
    if combined_desc:
        output["description"] = combined_desc
    full_desc = " ".join(part for part in [detailed_desc_text, avionics_text, engines_text, interior_text, remarks_text] if part).strip()
    if full_desc:
        output["description_full"] = full_desc

    engine_count = 1
    if eng2 is not None:
        engine_count = 2
    if re.search(r"\b(engine 2|2 x|twin)\b", engines_text, flags=re.I):
        engine_count = 2
    output["engine_count"] = engine_count

    engines_raw = []
    props_raw = []
    if eng1:
        engines_raw.append(
            {
                "position": "engine_1",
                "metric_type": "ENGINE_TIME",
                "metric_raw": eng1,
                "metric_hours": _to_int(eng1),
                "source_key": "Engine 1 Time",
            }
        )
    if eng2:
        engines_raw.append(
            {
                "position": "engine_2",
                "metric_type": "ENGINE_TIME",
                "metric_raw": eng2,
                "metric_hours": _to_int(eng2),
                "source_key": "Engine 2 Time",
            }
        )
    if prop1:
        props_raw.append(
            {
                "position": "prop_1",
                "metric_type": "PROP_TIME",
                "metric_raw": prop1,
                "metric_hours": _to_int(prop1),
                "source_key": "Prop 1 Time",
            }
        )
    if prop2:
        props_raw.append(
            {
                "position": "prop_2",
                "metric_type": "PROP_TIME",
                "metric_raw": prop2,
                "metric_hours": _to_int(prop2),
                "source_key": "Prop 2 Time",
            }
        )
    if engines_raw:
        output["engines_raw"] = engines_raw
    if props_raw:
        output["props_raw"] = props_raw

    image_urls: list[str] = []
    seen = set()
    for img in soup.select("div.img_area img[src], img[src*='cloudfront'], img[src*='dsgiipnwy']"):
        src = _norm_text(img.get("src"))
        if not src:
            continue
        absolute = urljoin(BASE_URL, src)
        if not _is_tap_listing_image(absolute):
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        image_urls.append(absolute)
    if image_urls:
        output["image_urls"] = image_urls
        output["primary_image_url"] = image_urls[0]

    seller_el = soup.select_one("#seller-info-area .sellerName [itemprop=name]") or soup.select_one("#seller-info-area .sellerName")
    if seller_el is not None:
        seller_name = _norm_text(seller_el.get_text(" ", strip=True))
        output["seller_name"] = seller_name
        if re.search(r"\b(llc|inc|aviation|aircraft|sales|jets)\b", seller_name, flags=re.I):
            output["seller_type"] = "dealer"
        else:
            output["seller_type"] = "private"

    return {k: v for k, v in output.items() if v is not None}
