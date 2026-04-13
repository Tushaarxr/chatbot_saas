"""
Async SQLAlchemy engine + ORM table definitions for the chatbot platform.

Tables (creation order respects FK deps):
    users         — registered platform users (auth)
    bots          — chatbot configurations (intent / rag / persona_rag)
    api_keys      — hashed API keys linked to bots
    messages      — persistent chat history per bot/session
    bot_analytics — daily usage counters per bot
"""

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from core.config import settings

# ---------------------------------------------------------------------------
# Engine & session factory
# ---------------------------------------------------------------------------

engine = create_async_engine(
    settings.postgres_url,
    echo=False,       # set True to log every SQL query during development
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    """
    FastAPI dependency that yields an async database session.

    Usage in a route:
        db: AsyncSession = Depends(get_db)
    """
    async with AsyncSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# ORM Base
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


# ---------------------------------------------------------------------------
# ORM Models  (order: User → Bot → ApiKey → Message → BotAnalytics)
# ---------------------------------------------------------------------------

class User(Base):
    """Platform user — identified by email. Password stored as bcrypt hash."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    bots: Mapped[list["Bot"]] = relationship("Bot", back_populates="user", cascade="all, delete")


class Bot(Base):
    """A chatbot created by a user — can be intent, rag, or persona_rag type."""

    __tablename__ = "bots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    bot_type: Mapped[str] = mapped_column(String, nullable=False)   # intent | rag | persona_rag
    persona_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    persona_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    intent_map: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[Optional["User"]] = relationship("User", back_populates="bots")
    api_keys: Mapped[list["ApiKey"]] = relationship("ApiKey", back_populates="bot", cascade="all, delete")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="bot", cascade="all, delete")
    analytics: Mapped[list["BotAnalytics"]] = relationship("BotAnalytics", back_populates="bot", cascade="all, delete")
    documents: Mapped[list["BotDocument"]] = relationship("BotDocument", back_populates="bot", cascade="all, delete")


class ApiKey(Base):
    """Hashed API key linked to a bot. Raw key shown once at creation time."""

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), nullable=False
    )
    key_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    prefix: Mapped[str] = mapped_column(String, nullable=False)     # first 12 chars for display
    key_encrypted: Mapped[Optional[str]] = mapped_column(String, nullable=True) # Fernet encrypted raw key
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    bot: Mapped["Bot"] = relationship("Bot", back_populates="api_keys")


class Message(Base):
    """Persistent chat history — one row per message (user + assistant = 2 rows per turn)."""

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)           # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # "intent"|"rag"|"cache"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    bot: Mapped["Bot"] = relationship("Bot", back_populates="messages")


class BotAnalytics(Base):
    """Daily usage counters per bot — one row per (bot_id, date). Upsert pattern."""

    __tablename__ = "bot_analytics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    query_count: Mapped[int] = mapped_column(Integer, default=0)
    cache_hits: Mapped[int] = mapped_column(Integer, default=0)
    intent_hits: Mapped[int] = mapped_column(Integer, default=0)
    rag_hits: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("bot_id", "date", name="uq_bot_analytics_bot_date"),
    )

    bot: Mapped["Bot"] = relationship("Bot", back_populates="analytics")

class BotDocument(Base):
    """Metadata for uploaded documents per bot."""

    __tablename__ = "bot_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    file_size_kb: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    bot: Mapped["Bot"] = relationship("Bot", back_populates="documents")
