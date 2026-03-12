from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from pypdf import PdfReader

try:
    from pdfminer.high_level import extract_text as pdfminer_extract_text
except Exception:  # pragma: no cover - fallback path
    pdfminer_extract_text = None

from config import AVIONICS_MANUFACTURER_ALIASES

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "avionics"
PDF_DIR = DATA_DIR / "pdf_sources"
OUT_DIR = DATA_DIR / "pdf_extracts"
PROGRESS_PATH = ROOT / "avionics_expansion_progress.json"

PDF_SOURCES = {
    "banyan": {
        "url": "https://www.banyanair.com/pdf/FAA_Capabilities_List.pdf",
        "source": "banyan_capabilities",
    },
    "weststar": {
        "url": "https://www.weststaraviation.com/wp-content/uploads/2021/03/CHA-Capabilities-List-Rev-34.pdf",
        "source": "weststar_capabilities",
    },
    "propel": {
        "url": "https://www.propelaviation.com/wp-content/uploads/2025/04/145-O9QR-Capability-list-revision-9-December-12-2024.pdf",
        "source": "propel_capabilities",
    },
}

UNIVERSAL_CANDIDATES = [
    "https://www.universalavionics.com/wp-content/uploads/2024/02/RPT-20169-Rev-30.pdf",
    "https://www.universalavionics.com/wp-content/uploads/2023/12/RPT-20169-Rev-30.pdf",
]

MODEL_RE = re.compile(r"\b([A-Z]{1,6}[- ]?\d{1,4}[A-Z0-9/-]*)\b")
PN_RE = re.compile(r"\b(\d{2,4}[-/]\d{2,5}[-/]\d{2,5}|[A-Z0-9]{2,6}[-/][A-Z0-9-]{2,})\b")
ATA_RE = re.compile(r"\b(2[1-9]|3[0-9]|4[0-9]|5[0-9]|7[0-9])\b")


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_progress() -> dict[str, Any]:
    if not PROGRESS_PATH.exists():
        return {}
    return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))


def write_progress(progress: dict[str, Any]) -> None:
    progress["last_updated"] = utcnow()
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2), encoding="utf-8")


def append_note(progress: dict[str, Any], note: str) -> None:
    progress.setdefault("notes", []).append(note)
    write_progress(progress)


def normalize_manufacturer(value: str) -> str:
    v = re.sub(r"\s+", " ", (value or "").strip()).upper()
    return AVIONICS_MANUFACTURER_ALIASES.get(v, value.strip() if value else "Unknown")


def download_pdf(url: str, dest: Path) -> bool:
    backoff = [2, 8, 30]
    for idx, delay in enumerate(backoff, start=1):
        try:
            resp = requests.get(url, timeout=45)
            if resp.status_code == 200 and "pdf" in resp.headers.get("content-type", "").lower():
                dest.write_bytes(resp.content)
                return True
        except Exception:
            pass
        if idx < len(backoff):
            time.sleep(delay)
    return False


def extract_pdf_text(path: Path) -> str:
    if pdfminer_extract_text is not None:
        try:
            return pdfminer_extract_text(str(path))
        except Exception:
            pass
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def parse_records(text: str, source_name: str, source_url: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 10:
            continue
        model_match = MODEL_RE.search(line)
        if not model_match:
            continue
        model = model_match.group(1).replace("  ", " ").strip("- ")
        if model.upper() in {"FAA", "PART", "LIST"}:
            continue
        pn_match = PN_RE.search(line)
        ata_match = ATA_RE.search(line)
        manufacturer = line.split(" ")[0].strip(",;:")
        description = line
        if pn_match:
            description = description.replace(pn_match.group(1), "").strip(" -")
        description = re.sub(r"\s+", " ", description)
        rows.append(
            {
                "manufacturer": normalize_manufacturer(manufacturer),
                "model": model,
                "part_number": pn_match.group(1) if pn_match else None,
                "description": description[:300],
                "ata_chapter": ata_match.group(1) if ata_match else None,
                "source": source_name,
                "source_url": source_url,
            }
        )
    dedup: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = f"{row['manufacturer']}|{row['model']}|{row.get('part_number') or ''}"
        dedup[key] = row
    return list(dedup.values())


def detect_universal_pdf() -> str | None:
    for candidate in UNIVERSAL_CANDIDATES:
        try:
            resp = requests.head(candidate, allow_redirects=True, timeout=25)
            if resp.status_code == 200 and "pdf" in resp.headers.get("content-type", "").lower():
                return candidate
        except Exception:
            continue
    return None


def run_one(source_key: str, cfg: dict[str, str], progress: dict[str, Any]) -> int:
    pdf_path = PDF_DIR / f"{source_key}.pdf"
    out_path = OUT_DIR / f"{source_key}.json"
    ok = download_pdf(cfg["url"], pdf_path)
    if not ok:
        append_note(progress, f"Phase 2 {source_key}: download failed, marked skipped.")
        progress["phases"]["phase_2_pdf_capabilities"][source_key] = "skipped"
        write_progress(progress)
        return 0
    try:
        text = extract_pdf_text(pdf_path)
        records = parse_records(text, cfg["source"], cfg["url"])
    except Exception as exc:
        append_note(progress, f"Phase 2 {source_key}: extraction failed ({exc}), marked skipped.")
        progress["phases"]["phase_2_pdf_capabilities"][source_key] = "skipped"
        write_progress(progress)
        return 0

    out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    progress["phases"]["phase_2_pdf_capabilities"][source_key] = "done"
    progress["stats"]["pdf_units_extracted"] = int(progress["stats"].get("pdf_units_extracted", 0)) + len(records)
    append_note(progress, f"Phase 2 {source_key}: extracted {len(records)} records.")
    return len(records)


def main() -> int:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    progress = load_progress()
    phase = progress.get("phases", {}).get("phase_2_pdf_capabilities", {})

    for source_key, cfg in PDF_SOURCES.items():
        if phase.get(source_key) == "done":
            continue
        progress["phases"]["phase_2_pdf_capabilities"][source_key] = "in_progress"
        write_progress(progress)
        run_one(source_key, cfg, progress)

    if phase.get("universal") != "done":
        progress["phases"]["phase_2_pdf_capabilities"]["universal"] = "in_progress"
        write_progress(progress)
        universal_url = detect_universal_pdf()
        if universal_url:
            run_one(
                "universal",
                {"url": universal_url, "source": "universal_capabilities"},
                progress,
            )
        else:
            progress["phases"]["phase_2_pdf_capabilities"]["universal"] = "skipped"
            append_note(progress, "Phase 2 universal: no direct capability PDF link found, skipped.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
