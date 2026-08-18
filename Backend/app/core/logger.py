"""Logging estructurado del backend."""

from __future__ import annotations

import logging
import sys

from app.core.config import Settings


def setup_logging(settings: Settings) -> None:
    nivel = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=nivel,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
        stream=sys.stdout,
        force=True,
    )
