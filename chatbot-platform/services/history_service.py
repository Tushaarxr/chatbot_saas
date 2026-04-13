"""
History service — save and retrieve persistent chat messages from PostgreSQL.

Per dev_guides.md §3B.
"""

import uuid
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.postgres import Message


async def save_turn(
    bot_id: uuid.UUID,
    session_id: str,
    user_query: str,
    assistant_answer: str,
    source_type: str,
    db: AsyncSession,
) -> None:
    """Persist one user→assistant exchange as two Message rows."""
    db.add(Message(
        bot_id=bot_id,
        session_id=session_id,
        role="user",
        content=user_query,
        source_type=None,
    ))
    db.add(Message(
        bot_id=bot_id,
        session_id=session_id,
        role="assistant",
        content=assistant_answer,
        source_type=source_type,
    ))
    await db.commit()


async def get_history(
    bot_id: uuid.UUID,
    session_id: str,
    limit: int = 50,
    db: Optional[AsyncSession] = None,
) -> list[Message]:
    """Return last N messages for a session, oldest first."""
    result = await db.execute(
        select(Message)
        .where(Message.bot_id == bot_id, Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_sessions(bot_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    """Return distinct session_ids for a bot with message count and last activity."""
    result = await db.execute(
        select(
            Message.session_id,
            func.count(Message.id).label("message_count"),
            func.max(Message.created_at).label("last_active"),
        )
        .where(Message.bot_id == bot_id)
        .group_by(Message.session_id)
        .order_by(func.max(Message.created_at).desc())
    )
    return [
        {
            "session_id": r.session_id,
            "message_count": r.message_count,
            "last_active": r.last_active,
        }
        for r in result.all()
    ]


async def delete_session(bot_id: uuid.UUID, session_id: str, db: AsyncSession) -> int:
    """Delete all messages in a session. Returns count of deleted rows."""
    result = await db.execute(
        delete(Message)
        .where(Message.bot_id == bot_id, Message.session_id == session_id)
    )
    await db.commit()
    return result.rowcount
