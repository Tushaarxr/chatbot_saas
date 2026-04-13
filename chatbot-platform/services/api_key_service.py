"""
API key generation, hashing, and resolution service.

Keys look like: cbp_<44 random chars>
Only the SHA-256 hash is stored in the database — the raw key is shown once.

Public API (v2 names):
  generate()        → (raw_key, key_hash, prefix)
  resolve(key, db)  → Bot | None
"""

import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from cryptography.fernet import Fernet

from core.logger import logger
from core.config import settings
from db.postgres import ApiKey, Bot

PREFIX = "cbp_"   # chatbot platform prefix — makes keys easy to recognise

try:
    fernet = Fernet(settings.api_key_encryption_secret.encode())
except Exception as e:
    logger.warning(f"Failed to initialize Fernet (encryption secret missing or invalid): {e}")
    fernet = None

def generate() -> tuple[str, str, str, str | None]:
    """
    Generate a new API key.

    Returns:
        (raw_key, key_hash, display_prefix, key_encrypted)
        - raw_key        : full plaintext
        - key_hash       : SHA-256 hex digest stored in the DB
        - display_prefix : first 12 characters for display
        - key_encrypted  : Fernet encrypted version of the raw key
    """
    raw = PREFIX + secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    prefix = raw[:12]
    key_encrypted = fernet.encrypt(raw.encode()).decode() if fernet else None
    return raw, hashed, prefix, key_encrypted

def decrypt_key(key_encrypted: str) -> str:
    """Decrypt a stored encrypted key. Returns plaintext raw key."""
    if not fernet:
        raise ValueError("Fernet is not initialized.")
    return fernet.decrypt(key_encrypted.encode()).decode()


async def resolve(key: str, db: AsyncSession) -> Bot | None:
    """
    Look up a bot by raw API key.

    Args:
        key: The raw API key from the X-API-Key header.
        db:  An open async SQLAlchemy session.

    Returns:
        The Bot ORM object if the key is valid and active; None otherwise.
    """
    hashed = hashlib.sha256(key.encode()).hexdigest()

    stmt = (
        select(ApiKey)
        .join(Bot, ApiKey.bot_id == Bot.id)
        .where(
            ApiKey.key_hash == hashed,
            ApiKey.is_active == True,   # noqa: E712
            Bot.is_active == True,      # noqa: E712
        )
        .options(selectinload(ApiKey.bot))   # eagerly load bot relationship
    )
    result = await db.execute(stmt)
    row: ApiKey | None = result.scalar_one_or_none()
    return row.bot if row else None


# ---------------------------------------------------------------------------
# Legacy aliases — kept for backward compat while old code is refactored
# ---------------------------------------------------------------------------

def generate_api_key() -> tuple[str, str, str]:
    """Deprecated alias for generate(). Use generate() directly."""
    raw, hashed, prefix, _ = generate()
    return raw, hashed, prefix


async def resolve_key(key: str, db: AsyncSession) -> Bot | None:
    """Deprecated alias for resolve(). Use resolve() directly."""
    return await resolve(key, db)
