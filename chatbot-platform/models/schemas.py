"""
All Pydantic v2 request/response schemas for the chatbot platform.
Keep all models in one file so it's easy to see the full API contract at a glance.
"""

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# ---------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------

BotType = Literal["intent", "rag", "persona_rag"]


# ---------------------------------------------------------------------------
# Auth schemas  (dev_guides §1D)
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    """Request body to register a new platform user."""
    email: EmailStr
    display_name: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Request body for username/password login."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response returned on successful login."""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


class UserResponse(BaseModel):
    """Public user representation (no password hash)."""
    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Bot management schemas  (dev_guides §2B + §5A hardening)
# ---------------------------------------------------------------------------

class CreateBotRequest(BaseModel):
    """Request body to create a new chatbot."""
    name: str = Field(..., min_length=1, max_length=100, pattern=r'^[\w\s\-]+$',
                      description="Display name for the bot")
    bot_type: BotType
    persona_name: Optional[str] = Field(None, max_length=50, description="Persona display name (persona_rag bots)")
    persona_prompt: Optional[str] = Field(None, max_length=2000, description="System persona (persona_rag bots only)")
    system_prompt: Optional[str] = Field(None, max_length=2000, description="Optional system instructions")


class UpdateBotRequest(BaseModel):
    """Request body for partial bot updates (PATCH). bot_type cannot be changed."""
    name: Optional[str] = Field(None, min_length=1, max_length=100, pattern=r'^[\w\s\-]+$')
    persona_name: Optional[str] = Field(None, max_length=50)
    persona_prompt: Optional[str] = Field(None, max_length=2000)
    system_prompt: Optional[str] = Field(None, max_length=2000)


class BotResponse(BaseModel):
    """Public bot representation (no sensitive keys)."""
    id: uuid.UUID
    name: str
    bot_type: BotType
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreateBotResponse(BotResponse):
    """Returned only at creation time — includes the raw API key (shown once)."""
    api_key: str = Field(..., description="Raw API key — save it, it won't be shown again")


class BotListResponse(BaseModel):
    """Paginated list of bots belonging to the authenticated user."""
    bots: list[BotResponse]
    total: int


# ---------------------------------------------------------------------------
# Query schemas  (dev_guides §5A hardening)
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    """Request body for a chat query."""
    query: str = Field(..., min_length=1, max_length=2000, description="The user's message")
    session_id: str = Field("default", max_length=100, pattern=r'^[\w\-]+$',
                            description="Conversation session ID")


class QueryResponse(BaseModel):
    """Response from the chatbot."""
    answer: str
    bot_id: uuid.UUID
    session_id: str
    source_type: Literal["intent", "rag", "cache"]


# ---------------------------------------------------------------------------
# Intent training schemas  (dev_guides §5A hardening)
# ---------------------------------------------------------------------------

class IntentItem(BaseModel):
    """A single intent class with training examples and its canned response."""
    label: str = Field(..., min_length=1, max_length=50, pattern=r'^[\w_]+$',
                       description="Intent label, e.g. 'greeting'")
    examples: list[str] = Field(..., description="At least 5 training examples")
    response: str = Field(..., min_length=1, max_length=500, description="Canned response when this intent is detected")

    @field_validator("examples")
    @classmethod
    def min_five_examples(cls, v: list[str]) -> list[str]:
        """Enforce minimum 5 training examples per intent."""
        if len(v) < 5:
            raise ValueError("Each intent label requires at least 5 training examples")
        return v


class IntentUploadRequest(BaseModel):
    """Request body to upload and train intent classifier."""
    intents: list[IntentItem] = Field(..., min_length=2, description="At least 2 intent classes")


# ---------------------------------------------------------------------------
# Document upload schema
# ---------------------------------------------------------------------------

class DocumentUploadResponse(BaseModel):
    """Response after successfully indexing a document."""
    bot_id: str
    chunks_indexed: int
    filename: str


# ---------------------------------------------------------------------------
# Chat history schemas  (dev_guides §3C)
# ---------------------------------------------------------------------------

class MessageRecord(BaseModel):
    """Single message in a chat session."""
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    source_type: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatHistoryResponse(BaseModel):
    """Full message history for one session."""
    bot_id: uuid.UUID
    session_id: str
    messages: list[MessageRecord]
    total: int


class SessionSummary(BaseModel):
    """Summary of a chat session — returned by list_sessions."""
    session_id: str
    message_count: int
    last_active: datetime


# ---------------------------------------------------------------------------
# Analytics schemas  (dev_guides §4C)
# ---------------------------------------------------------------------------

class DailyAnalytics(BaseModel):
    """Usage counters for one calendar day."""
    date: date
    query_count: int
    cache_hits: int
    intent_hits: int
    rag_hits: int

    model_config = ConfigDict(from_attributes=True)


class AnalyticsResponse(BaseModel):
    """Analytics report for a bot over a given time window."""
    bot_id: uuid.UUID
    period_days: int
    totals: dict
    daily: list[DailyAnalytics]


# ---------------------------------------------------------------------------
# Embed snippet schema
# ---------------------------------------------------------------------------

class SnippetResponse(BaseModel):
    """Copy-paste code snippets to integrate the bot into any app."""
    bot_id: str
    javascript: str
    python_code: str    # named python_code to avoid shadowing the built-in
    curl: str


# ---------------------------------------------------------------------------
# Phase 2 schemas
# ---------------------------------------------------------------------------

class ApiKeyResponse(BaseModel):
    """API key retrieval response."""
    api_key: str
    prefix: str
    created_at: datetime


class DocumentRecord(BaseModel):
    """Metadata for an indexed document."""
    id: uuid.UUID
    filename: str
    file_size_kb: int
    chunk_count: int
    description: Optional[str]
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class DocumentListResponse(BaseModel):
    """List of documents for a bot."""
    documents: list[DocumentRecord]
    total: int
