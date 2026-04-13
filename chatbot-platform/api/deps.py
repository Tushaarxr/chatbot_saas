"""
Shared FastAPI dependencies — injected into route handlers via Depends().

Provides:
  get_db_dep        → yields an async DB session
  resolve_api_key   → resolves X-API-Key header to a Bot + enforces rate limit
  get_current_user  → decodes JWT Bearer token and returns the authenticated User
"""

import uuid
import time
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from core.logger import logger
from db.postgres import Bot, User, get_db
from services.api_key_service import resolve
from services.auth_service import decode_token
from services.query_router import REDIS_AVAILABLE, _redis


async def get_db_dep() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session. FastAPI closes it after the request."""
    async for session in get_db():
        yield session


async def resolve_api_key(
    request: Request,
    db: AsyncSession = Depends(get_db_dep),
) -> Bot:
    """
    FastAPI dependency that:
      1. Extracts the X-API-Key header (401 if missing)
      2. Resolves the key to an active Bot (401 if invalid or revoked)
      3. Enforces 60 req/min rate limit per bot via Redis (skipped if Redis is down)

    Usage:
        bot: Bot = Depends(resolve_api_key)
    """
    key = request.headers.get("X-API-Key")
    if not key:
        raise HTTPException(status_code=401, detail="X-API-Key header is required")

    bot = await resolve(key, db)
    if not bot:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")

    # Rate limiting — 60 req/min per bot using a Redis counter
    if REDIS_AVAILABLE and _redis is not None:
        try:
            minute = int(time.time() // 60)
            rate_key = f"rl:{bot.id}:{minute}"
            count = _redis.incr(rate_key)
            _redis.expire(rate_key, 60)
            if count > 60:
                logger.warning(f"Rate limit exceeded for bot {bot.id}")
                raise HTTPException(
                    status_code=429, detail="Rate limit: 60 req/min exceeded"
                )
        except HTTPException:
            raise
        except Exception as exc:
            # Redis hiccup → skip rate limiting, let the request through
            logger.warning(f"Rate limit check skipped (Redis error): {exc}")

    return bot


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
    db: AsyncSession = Depends(get_db_dep),
) -> User:
    """Decode JWT Bearer token and return the authenticated User. Raises 401 on any failure."""
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalid or expired")

    user = await db.get(User, uuid.UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user
