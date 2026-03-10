from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class CookieManager:
    COOKIE_FILE: Path
    TAP_DOMAIN = ".trade-a-plane.com"
    DATADOME_COOKIE_NAME = "datadome"
    SESSION_ID_COOKIE_NAME = "SESSION_ID"

    def __init__(self, cookie_file: str | Path):
        self.COOKIE_FILE = Path(cookie_file)
        self._raw_cache: list[dict[str, Any]] | None = None

    def _read_raw(self) -> list[dict[str, Any]]:
        if not self.COOKIE_FILE.exists():
            return []
        payload = json.loads(self.COOKIE_FILE.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            return []
        rows = [row for row in payload if isinstance(row, dict)]
        self._raw_cache = rows
        return rows

    def load_cookies(self) -> list[dict]:
        raw_rows = self._raw_cache if self._raw_cache is not None else self._read_raw()
        mapped: list[dict[str, Any]] = []
        same_site_map = {
            "no_restriction": "None",
            "lax": "Lax",
            "strict": "Strict",
            "unspecified": "None",
            "none": "None",
        }
        for row in raw_rows:
            name = str(row.get("name") or "").strip()
            if not name:
                continue
            value = str(row.get("value") or "")
            domain = str(row.get("domain") or self.TAP_DOMAIN).strip() or self.TAP_DOMAIN
            path = str(row.get("path") or "/").strip() or "/"
            pw_cookie: dict[str, Any] = {
                "name": name,
                "value": value,
                "domain": domain,
                "path": path,
                "httpOnly": bool(row.get("httpOnly", False)),
                "secure": bool(row.get("secure", False)),
                "sameSite": same_site_map.get(str(row.get("sameSite") or "").strip().lower(), "None"),
            }
            exp = row.get("expirationDate")
            if exp not in (None, "", 0):
                try:
                    pw_cookie["expires"] = float(exp)
                except (TypeError, ValueError):
                    pass
            mapped.append(pw_cookie)
        return mapped

    def _get_datadome_cookie(self) -> dict[str, Any] | None:
        for cookie in self.load_cookies():
            if str(cookie.get("name") or "").lower() == self.DATADOME_COOKIE_NAME:
                return cookie
        return None

    def has_valid_datadome(self) -> bool:
        cookie = self._get_datadome_cookie()
        if not cookie:
            return False
        expires = cookie.get("expires")
        if expires in (None, "", 0):
            return bool(cookie.get("value"))
        try:
            return float(expires) > datetime.now(timezone.utc).timestamp() and bool(cookie.get("value"))
        except (TypeError, ValueError):
            return False

    def get_datadome_age_hours(self) -> float:
        cookie = self._get_datadome_cookie()
        if not cookie:
            return -1.0
        expires = cookie.get("expires")
        if expires in (None, "", 0):
            return -1.0
        # DataDome token TTL is usually long; estimate issuance from remaining TTL of one year.
        # This is heuristic but useful for aging alerts.
        one_year_hours = 24.0 * 365.0
        try:
            now_ts = datetime.now(timezone.utc).timestamp()
            hours_left = max(0.0, (float(expires) - now_ts) / 3600.0)
            age = max(0.0, one_year_hours - hours_left)
            return age
        except (TypeError, ValueError):
            return -1.0

    async def inject(self, context) -> bool:
        cookies = self.load_cookies()
        if not cookies:
            return False
        await context.add_cookies(cookies)
        return self.has_valid_datadome()

    async def export_from_context(self, context) -> None:
        context_cookies = await context.cookies()
        if not context_cookies:
            return
        dd = next((c for c in context_cookies if str(c.get("name") or "").lower() == self.DATADOME_COOKIE_NAME), None)
        if not dd or not dd.get("value"):
            return

        existing_raw = self._raw_cache if self._raw_cache is not None else self._read_raw()
        existing_by_key = {
            (str(item.get("domain") or ""), str(item.get("name") or ""), str(item.get("path") or "/")): dict(item)
            for item in existing_raw
            if isinstance(item, dict)
        }

        for cookie in context_cookies:
            name = str(cookie.get("name") or "").strip()
            if not name:
                continue
            key = (str(cookie.get("domain") or ""), name, str(cookie.get("path") or "/"))
            existing_by_key[key] = {
                **existing_by_key.get(key, {}),
                "domain": key[0],
                "name": name,
                "value": str(cookie.get("value") or ""),
                "path": key[2],
                "expirationDate": cookie.get("expires") if cookie.get("expires") not in (None, -1) else None,
                "httpOnly": bool(cookie.get("httpOnly", False)),
                "secure": bool(cookie.get("secure", False)),
                "sameSite": str(cookie.get("sameSite") or "unspecified").lower(),
            }

        merged = [v for v in existing_by_key.values() if isinstance(v, dict)]
        self.COOKIE_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
        self._raw_cache = merged

    def print_status(self) -> None:
        cookie = self._get_datadome_cookie()
        if not cookie:
            print("[COOKIE] datadome: missing")
            return
        valid = self.has_valid_datadome()
        age_hours = self.get_datadome_age_hours()
        expires = cookie.get("expires")
        expires_text = "session"
        if expires not in (None, "", 0):
            try:
                expires_text = datetime.fromtimestamp(float(expires), tz=timezone.utc).isoformat()
            except (TypeError, ValueError):
                expires_text = "unknown"
        print(f"[COOKIE] datadome valid={valid} age_hours={age_hours:.1f} expires={expires_text}")
