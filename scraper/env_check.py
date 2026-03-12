from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv


def env_check(required: Iterable[str] | None = None) -> None:
    """
    Lightweight shared env validator for scraper scripts.
    """
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    required_vars = list(required) if required is not None else ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    missing = [name for name in required_vars if not os.getenv(name)]
    if missing:
        raise EnvironmentError(f"Missing required environment variables: {', '.join(missing)}")
