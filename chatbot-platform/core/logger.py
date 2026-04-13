"""
Shared logger for the entire backend platform.
Import `logger` anywhere you need structured logging.
"""

import logging
import sys


def _setup_logger() -> logging.Logger:
    """Create and configure the platform logger."""
    log = logging.getLogger("chatbot_platform")
    log.setLevel(logging.INFO)

    # Avoid adding duplicate handlers if the module is reloaded
    if log.handlers:
        return log

    # Stream handler (console)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)

    # File handler (debug)
    from pathlib import Path
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    file_handler = logging.FileHandler(log_dir / "platform.log")
    file_handler.setLevel(logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    file_handler.setFormatter(formatter)
    
    log.addHandler(handler)
    log.addHandler(file_handler)
    return log


logger = _setup_logger()
