"""
One-time table creation runner.

Creation order respects FK dependencies:
  User → Bot → ApiKey → Message → BotAnalytics

Run directly:
    python -m db.migrations
Or called automatically on FastAPI startup in main.py.
"""

import asyncio

from sqlalchemy import text

from core.logger import logger
from db.postgres import Base, engine


async def create_tables() -> None:
    """Create all ORM tables in PostgreSQL if they don't already exist."""
    async with engine.begin() as conn:
        # create_all respects table dependency order via FK metadata
        await conn.run_sync(Base.metadata.create_all)

        # Explicit indexes not captured by SQLAlchemy column-level index=True
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_users_email "
            "ON users(email)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_messages_bot_session "
            "ON messages(bot_id, session_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_messages_created "
            "ON messages(created_at DESC)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_analytics_bot_date "
            "ON bot_analytics(bot_id, date DESC)"
        ))
        
        # Phase 2: Add key_encrypted column to api_keys (migration for existing DBs)
        await conn.execute(text(
            "ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_encrypted VARCHAR"
        ))

        # Phase 2: Add index for bot_documents
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_documents_bot "
            "ON bot_documents(bot_id, uploaded_at DESC)"
        ))

    logger.info("All tables verified/created: users, bots, api_keys, messages, bot_analytics, bot_documents")


if __name__ == "__main__":
    asyncio.run(create_tables())
