"""Compatibility adaptive rate limiter for scraper pipelines."""

from __future__ import annotations

import random
import time
from typing import Any


class AdaptiveRateLimiter:
    """Minimal adaptive limiter used by Controller/TAP scrapers."""

    def __init__(self, supabase: Any, source_site: str, logger: Any = None) -> None:
        self.supabase = supabase
        self.source_site = source_site
        self.logger = logger
        self._base_delay_s = 2.5
        self._challenge_streak = 0
        self._pause_until_epoch = 0.0
        self._last_wait_epoch = 0.0

    def wait(self) -> float:
        now = time.time()
        if self._pause_until_epoch > now:
            sleep_for = self._pause_until_epoch - now
            if sleep_for > 0:
                time.sleep(sleep_for)

        penalty = min(8.0, self._challenge_streak * 0.75)
        delay = self._base_delay_s + penalty + random.uniform(0.0, 0.6)
        since_last = now - self._last_wait_epoch if self._last_wait_epoch else None
        if since_last is None or since_last < delay:
            time.sleep(max(0.0, delay - (since_last or 0.0)))
        self._last_wait_epoch = time.time()
        return delay

    def on_challenge_or_429(self) -> None:
        self._challenge_streak = min(self._challenge_streak + 1, 12)
        cooldown = min(180.0, 20.0 + (self._challenge_streak * 12.0))
        self._pause_until_epoch = max(self._pause_until_epoch, time.time() + cooldown)
        if self.logger:
            self.logger.warning(
                "[%s] Adaptive limiter challenge streak=%s cooldown=%.1fs",
                self.source_site,
                self._challenge_streak,
                cooldown,
            )

    def should_pause(self) -> bool:
        return time.time() < self._pause_until_epoch

    def pause_duration_seconds(self) -> int:
        return max(0, int(self._pause_until_epoch - time.time()))

    def get_recommended_settings(self) -> dict[str, int]:
        delay_ms = int((self._base_delay_s + min(5.0, self._challenge_streak * 0.5)) * 1000)
        batch_size = max(3, 10 - min(6, self._challenge_streak))
        return {
            "safe_delay_ms": delay_ms,
            "safe_batch_size": batch_size,
        }
