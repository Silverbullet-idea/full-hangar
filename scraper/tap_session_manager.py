from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

from bs4 import BeautifulSoup

from tap_cookie_manager import CookieManager

log = logging.getLogger(__name__)


class TAPSessionExpiredError(RuntimeError):
    pass


class TAPSessionManager:
    HEALING_LEVELS = {
        0: "cookie_injection",
        1: "cookie_injection_slow",
        2: "fresh_context_with_cookies",
        3: "operator_refresh_required",
    }

    _UA_POOL = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    ]

    def __init__(self) -> None:
        self._browser = None
        self._context = None
        self._current_healing_level = 0
        self._block_streak = 0
        self._health_score = 100
        self._cookie_manager: CookieManager | None = None

    async def create_session(self, playwright, cookie_manager: CookieManager) -> tuple:
        self._cookie_manager = cookie_manager
        self._browser = await playwright.chromium.launch(
            headless=False,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--window-size=1366,768",
            ],
        )
        self._context = await self._browser.new_context(
            user_agent=random.choice(self._UA_POOL),
            viewport={"width": 1366, "height": 768},
            locale="en-US",
            timezone_id="America/Chicago",
        )
        await self._context.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
            window.chrome = {runtime: {}};
            """
        )
        await cookie_manager.inject(self._context)
        page = await self._context.new_page()
        return self._browser, self._context, page

    async def navigate_with_healing(
        self,
        page,
        url: str,
        *,
        expected_content: str = "result_listing",
        max_attempts: int = 3,
    ) -> tuple[BeautifulSoup | None, bool]:
        _ = expected_content
        for _attempt in range(1, max_attempts + 1):
            status = 0
            html = ""
            try:
                response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                status = response.status if response else 0
                await asyncio.sleep(random.uniform(1.5, 4.0))
                html = await page.content()
            except Exception:
                status = 503
            blocked = self._is_blocked(html, status)
            if not blocked:
                self._block_streak = 0
                self._current_healing_level = 0
                self._health_score = min(100, self._health_score + 2)
                return BeautifulSoup(html, "html.parser"), False

            self._block_streak += 1
            self._health_score = max(0, self._health_score - 12)
            log.warning("[TAP] Block detected (streak=%s) at %s", self._block_streak, url)
            level = min(3, self._current_healing_level)
            page = await self._apply_healing(self._context, page, level, self._cookie_manager)
            self._current_healing_level = min(3, self._current_healing_level + 1)
        return None, True

    def _is_blocked(self, html: str, status: int) -> bool:
        low = (html or "").lower()
        block_signals = [
            "captcha-delivery.com" in low,
            "please enable js and disable any ad blocker" in low,
            "geo.captcha-delivery.com" in low,
            "datadome" in low and "result_listing" not in low,
            status in (403, 429, 503),
        ]
        return any(block_signals)

    async def _apply_healing(self, context, page, level: int, cookie_manager: CookieManager | None) -> Any:
        if level == 0:
            await asyncio.sleep(random.uniform(15, 30))
        elif level == 1:
            await page.close()
            page = await context.new_page()
            await asyncio.sleep(random.uniform(30, 60))
        elif level == 2:
            await context.close()
            if self._browser is None:
                raise TAPSessionExpiredError("Browser missing during healing")
            self._context = await self._browser.new_context(
                user_agent=random.choice(self._UA_POOL),
                viewport={"width": 1366, "height": 768},
                locale="en-US",
                timezone_id="America/Chicago",
            )
            await self._context.add_init_script(
                """
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
                window.chrome = {runtime: {}};
                """
            )
            if cookie_manager is not None:
                await cookie_manager.inject(self._context)
            page = await self._context.new_page()
            await asyncio.sleep(random.uniform(60, 120))
        elif level >= 3:
            self._require_operator_refresh()
        return page

    def _require_operator_refresh(self):
        log.error(
            "\n"
            + "=" * 60
            + "\nDATADOME SESSION EXPIRED — MANUAL REFRESH REQUIRED\n"
            + "=" * 60
            + "\n1. Open Chrome and navigate to www.trade-a-plane.com"
            + "\n2. Browse normally for 2-3 minutes"
            + "\n3. Install EditThisCookie extension if not installed"
            + "\n4. Export cookies to: scraper/tap_cookies.json"
            + "\n5. Run: .venv312\\Scripts\\python.exe scraper\\tap_auto_scraper.py --resume"
            + "\n"
            + "=" * 60
        )
        raise TAPSessionExpiredError("DataDome session expired — operator refresh required")

    def get_health_score(self) -> int:
        return max(0, min(100, int(self._health_score)))

    async def human_warmup(self, page) -> None:
        viewport = page.viewport_size or {"width": 1366, "height": 768}
        for _ in range(random.randint(3, 6)):
            x = random.randint(30, max(100, viewport["width"] - 30))
            y = random.randint(80, max(140, viewport["height"] - 40))
            await page.mouse.move(x, y, steps=random.randint(6, 18))
            await asyncio.sleep(random.uniform(0.2, 0.8))
            await page.mouse.wheel(0, random.randint(120, 520))
        await asyncio.sleep(random.uniform(2, 6))
