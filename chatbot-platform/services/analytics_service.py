"""
Analytics service — daily usage counters per bot using PostgreSQL upsert.

Per dev_guides.md §4B.
"""

import uuid
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.postgres import BotAnalytics


async def record_query(
    bot_id: uuid.UUID,
    source_type: str,   # "intent" | "rag" | "cache"
    db: AsyncSession,
) -> None:
    """Upsert daily analytics row — increments appropriate counter atomically."""
    today = date.today()
    stmt = pg_insert(BotAnalytics).values(
        bot_id=bot_id,
        date=today,
        query_count=1,
        cache_hits=1 if source_type == "cache" else 0,
        intent_hits=1 if source_type == "intent" else 0,
        rag_hits=1 if source_type == "rag" else 0,
    ).on_conflict_do_update(
        index_elements=["bot_id", "date"],
        set_={
            "query_count": BotAnalytics.query_count + 1,
            "cache_hits":  BotAnalytics.cache_hits  + (1 if source_type == "cache"  else 0),
            "intent_hits": BotAnalytics.intent_hits + (1 if source_type == "intent" else 0),
            "rag_hits":    BotAnalytics.rag_hits    + (1 if source_type == "rag"    else 0),
        }
    )
    await db.execute(stmt)
    await db.commit()


async def get_analytics(
    bot_id: uuid.UUID,
    days: int = 30,
    db: Optional[AsyncSession] = None,
) -> list[BotAnalytics]:
    """Return daily analytics rows for the last N days, newest first."""
    cutoff = date.today() - timedelta(days=days)
    result = await db.execute(
        select(BotAnalytics)
        .where(BotAnalytics.bot_id == bot_id, BotAnalytics.date >= cutoff)
        .order_by(BotAnalytics.date.desc())
    )
    return list(result.scalars().all())


async def get_totals(bot_id: uuid.UUID, db: AsyncSession) -> dict:
    """Return lifetime totals for a bot."""
    result = await db.execute(
        select(
            func.sum(BotAnalytics.query_count).label("total_queries"),
            func.sum(BotAnalytics.cache_hits).label("total_cache_hits"),
            func.sum(BotAnalytics.intent_hits).label("total_intent_hits"),
            func.sum(BotAnalytics.rag_hits).label("total_rag_hits"),
        ).where(BotAnalytics.bot_id == bot_id)
    )
    row = result.one()
    total_q = row.total_queries or 0
    return {
        "total_queries":    total_q,
        "total_cache_hits": row.total_cache_hits or 0,
        "cache_hit_rate":   round((row.total_cache_hits or 0) / max(total_q, 1), 4),
        "total_intent_hits": row.total_intent_hits or 0,
        "total_rag_hits":   row.total_rag_hits or 0,
    }
