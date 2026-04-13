"""
Bot CRUD service — business logic layer between the API routes and the database.
All functions accept an AsyncSession so they're easy to test in isolation.

Public API:
  create(data, user_id, db)                → (Bot, raw_api_key)
  get(bot_id, db)                          → Bot | None
  list_for_user(user_id, db)              → list[Bot]
  update(bot_id, user_id, data, db)       → Bot
  delete(bot_id, user_id, db)             → None   (soft delete)
  set_intent_map(bot_id, intent_map, db)  → None
"""

import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.logger import logger
from db.postgres import ApiKey, Bot
from models.schemas import CreateBotRequest, UpdateBotRequest
from services.api_key_service import generate


async def create(data: CreateBotRequest, user_id: uuid.UUID, db: AsyncSession) -> tuple[Bot, str]:
    """Create a new bot attached to user_id and generate its first API key."""
    bot = Bot(
        name=data.name,
        bot_type=data.bot_type,
        persona_name=data.persona_name,
        persona_prompt=data.persona_prompt,
        system_prompt=data.system_prompt,
        user_id=user_id,
    )
    db.add(bot)
    await db.flush()   # assigns bot.id without committing the transaction

    raw_key, hashed, prefix, key_encrypted = generate()
    db.add(ApiKey(bot_id=bot.id, key_hash=hashed, prefix=prefix, key_encrypted=key_encrypted))
    await db.commit()
    await db.refresh(bot)

    logger.info(f"Created bot '{bot.name}' (id={bot.id}, type={bot.bot_type})")
    return bot, raw_key


async def get(bot_id: uuid.UUID, db: AsyncSession) -> Optional[Bot]:
    """Fetch a bot by primary key. Returns None if not found."""
    return await db.get(Bot, bot_id)


async def list_for_user(user_id: uuid.UUID, db: AsyncSession) -> list[Bot]:
    """Return all active bots owned by this user, newest first."""
    result = await db.execute(
        select(Bot)
        .where(Bot.user_id == user_id, Bot.is_active == True)
        .order_by(Bot.created_at.desc())
    )
    return list(result.scalars().all())


async def update(
    bot_id: uuid.UUID,
    user_id: uuid.UUID,
    data: UpdateBotRequest,
    db: AsyncSession,
) -> Bot:
    """Update mutable bot fields. Raises 404 if not found, 403 if wrong owner."""
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    if bot.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your bot")
    update_data = data.model_dump(exclude_unset=True)   # only update provided fields
    for field, value in update_data.items():
        setattr(bot, field, value)
    await db.commit()
    await db.refresh(bot)
    return bot


async def delete(bot_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    """Soft delete — sets is_active=False. Raises 404/403 on bad input."""
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    if bot.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your bot")
    bot.is_active = False
    await db.commit()
    logger.info(f"Soft-deleted bot {bot_id}")


async def set_intent_map(bot_id: uuid.UUID, intent_map: dict, db: AsyncSession) -> None:
    """Persist a new intent_map (label → canned response) for a bot."""
    bot = await db.get(Bot, bot_id)
    if bot is None:
        raise ValueError(f"Bot {bot_id} not found")
    bot.intent_map = intent_map
    await db.commit()
    logger.info(f"Updated intent_map for bot {bot_id} ({len(intent_map)} labels)")


# ---------------------------------------------------------------------------
# Legacy aliases — kept for backward compat
# ---------------------------------------------------------------------------

async def create_bot(data: CreateBotRequest, db: AsyncSession) -> tuple[Bot, str]:
    """Deprecated alias — user_id defaults to None for anonymous bots."""
    return await create(data, None, db)


async def get_bot(bot_id: uuid.UUID, db: AsyncSession) -> Optional[Bot]:
    """Deprecated alias for get(). Use get() directly."""
    return await get(bot_id, db)


async def update_intent_map(bot_id: uuid.UUID, intent_map: dict, db: AsyncSession) -> None:
    """Deprecated alias for set_intent_map(). Use set_intent_map() directly."""
    return await set_intent_map(bot_id, intent_map, db)
