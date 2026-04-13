"""
Platform management API — bot CRUD, document upload, intent training,
chat history, analytics, and snippets.
All routes are prefixed with /platform (mounted in router.py).

Per dev_guides.md §2C, §3E, §4E, §5B.
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_dep
from core.logger import logger
from db.postgres import Bot, User, ApiKey, BotDocument
from services.api_key_service import generate as generate_api_key, decrypt_key
from models.schemas import (
    AnalyticsResponse,
    ApiKeyResponse,
    BotListResponse,
    BotResponse,
    ChatHistoryResponse,
    CreateBotRequest,
    CreateBotResponse,
    DailyAnalytics,
    DocumentListResponse,
    DocumentRecord,
    DocumentUploadResponse,
    IntentUploadRequest,
    MessageRecord,
    SessionSummary,
    SnippetResponse,
    UpdateBotRequest,
)
from services import bot_service
from services.analytics_service import get_analytics, get_totals
from services.history_service import delete_session, get_history, list_sessions
from services.snippet_generator import generate as generate_snippet
from intent.classifier import train
from rag.document_processor import process_and_index

router = APIRouter(prefix="/platform", tags=["platform"])

# ---------------------------------------------------------------------------
# File upload security constants  (dev_guides §5B)
# ---------------------------------------------------------------------------

MAX_FILE_SIZE = 20 * 1024 * 1024   # 20 MB hard limit
ALLOWED_EXTENSIONS = {".pdf", ".txt"}
ALLOWED_MIME_TYPES = {"application/pdf", "text/plain"}


# ---------------------------------------------------------------------------
# Helper: verify bot ownership  (dev_guides §3E)
# ---------------------------------------------------------------------------

async def verify_bot_owner(bot_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Bot:
    """Fetch bot, raise 404 if missing/inactive, 403 if wrong owner."""
    bot = await db.get(Bot, bot_id)
    if not bot or not bot.is_active:
        raise HTTPException(status_code=404, detail="Bot not found")
    if bot.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return bot


# ---------------------------------------------------------------------------
# POST /platform/bots — create a new bot  (updated: requires auth)
# ---------------------------------------------------------------------------

@router.post("/bots", response_model=CreateBotResponse, status_code=201)
async def create_bot_endpoint(
    data: CreateBotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Create a new chatbot owned by the authenticated user. Returns bot details + one-time API key."""
    bot, raw_key = await bot_service.create(data, current_user.id, db)
    return CreateBotResponse(
        id=bot.id,
        name=bot.name,
        bot_type=bot.bot_type,
        is_active=bot.is_active,
        created_at=bot.created_at,
        api_key=raw_key,
    )


# ---------------------------------------------------------------------------
# GET /platform/bots — list all bots for the current user  (NEW)
# ---------------------------------------------------------------------------

@router.get("/bots", response_model=BotListResponse)
async def list_bots_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Return all active bots owned by the authenticated user, newest first."""
    bots = await bot_service.list_for_user(current_user.id, db)
    return BotListResponse(
        bots=[BotResponse.model_validate(b) for b in bots],
        total=len(bots),
    )


# ---------------------------------------------------------------------------
# GET /platform/bots/{bot_id} — fetch bot details
# ---------------------------------------------------------------------------

@router.get("/bots/{bot_id}", response_model=BotResponse)
async def get_bot_endpoint(
    bot_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_dep),
):
    """Fetch bot metadata by ID."""
    bot = await bot_service.get(bot_id, db)
    if bot is None:
        raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
    return BotResponse.model_validate(bot)


# ---------------------------------------------------------------------------
# PATCH /platform/bots/{bot_id} — update mutable fields  (NEW)
# ---------------------------------------------------------------------------

@router.patch("/bots/{bot_id}", response_model=BotResponse)
async def update_bot_endpoint(
    bot_id: uuid.UUID,
    data: UpdateBotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Update bot name, persona, or system prompt. Cannot change bot_type."""
    bot = await bot_service.update(bot_id, current_user.id, data, db)
    return BotResponse.model_validate(bot)


# ---------------------------------------------------------------------------
# DELETE /platform/bots/{bot_id} — soft delete  (NEW)
# ---------------------------------------------------------------------------

@router.delete("/bots/{bot_id}", status_code=204)
async def delete_bot_endpoint(
    bot_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Soft-delete a bot (sets is_active=False). FAISS/model files are not removed."""
    await bot_service.delete(bot_id, current_user.id, db)


# ---------------------------------------------------------------------------
# POST /platform/bots/{bot_id}/documents — upload and index a PDF or TXT
# (hardened per dev_guides §5B)
# ---------------------------------------------------------------------------

@router.post("/bots/{bot_id}/documents", response_model=DocumentUploadResponse)
async def upload_documents(
    bot_id: uuid.UUID,
    file: UploadFile = File(...),
    description: str = Header("", alias="X-Description"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Upload a PDF or TXT document and index it into the bot's FAISS vector store."""
    await verify_bot_owner(bot_id, current_user.id, db)

    # --- file validation (dev_guides §5B) ---
    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}",
        )

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail="MIME type does not match file extension",
        )

    filename = file.filename or "upload"
    try:
        count = await process_and_index(
            bot_id=str(bot_id),
            file_bytes=file_bytes,
            filename=filename,
            description=description,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Document indexing error for bot {bot_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {exc}")

    return DocumentUploadResponse(
        bot_id=str(bot_id),
        chunks_indexed=count,
        filename=filename,
    )


# ---------------------------------------------------------------------------
# POST /platform/bots/{bot_id}/intents — train DistilBERT intent classifier
# ---------------------------------------------------------------------------

@router.post("/bots/{bot_id}/intents")
async def upload_intents(
    bot_id: uuid.UUID,
    data: IntentUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Upload intent training data and fine-tune a DistilBERT classifier."""
    bot = await verify_bot_owner(bot_id, current_user.id, db)
    if bot.bot_type != "intent":
        raise HTTPException(
            status_code=400,
            detail=f"Only intent bots support this endpoint. Bot type is '{bot.bot_type}'.",
        )

    result = await train(str(bot_id), data.intents)
    intent_map = {item.label: item.response for item in data.intents}
    await bot_service.set_intent_map(bot_id, intent_map, db)

    return {
        "status": result["status"],
        "accuracy": result["accuracy"],
        "labels": result["labels"],
    }


# ---------------------------------------------------------------------------
# GET /platform/bots/{bot_id}/snippet — get integration code snippets
# ---------------------------------------------------------------------------

@router.get("/bots/{bot_id}/snippet", response_model=SnippetResponse)
async def get_snippet(
    bot_id: uuid.UUID,
    base_url: str = "http://localhost:8001",
    db: AsyncSession = Depends(get_db_dep),
):
    """Return copy-paste JavaScript, Python, and curl snippets for this bot."""
    bot = await bot_service.get(bot_id, db)
    if bot is None:
        raise HTTPException(status_code=404, detail=f"Bot {bot_id} not found")
    return generate_snippet(str(bot_id), base_url)

# ---------------------------------------------------------------------------
# API Key Endpoints (Phase 2 tweaks)
# ---------------------------------------------------------------------------

@router.get("/bots/{bot_id}/api-key", response_model=ApiKeyResponse)
async def get_api_key(
    bot_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Retrieve the stored API key."""
    await verify_bot_owner(bot_id, current_user.id, db)
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.bot_id == bot_id, ApiKey.is_active == True)
        .order_by(ApiKey.created_at.desc())
        .limit(1)
    )
    api_key_row = result.scalar_one_or_none()
    
    if not api_key_row:
        raise HTTPException(404, "No active API key found")
    if not api_key_row.key_encrypted:
        raise HTTPException(
            status_code=404,
            detail="API key was created before encrypted storage was added. "
                   "Use the regenerate endpoint to get a new retrievable key."
        )
        
    raw_key = decrypt_key(api_key_row.key_encrypted)
    return ApiKeyResponse(
        api_key=raw_key,
        prefix=api_key_row.prefix,
        created_at=api_key_row.created_at
    )

@router.post("/bots/{bot_id}/api-key/regenerate")
async def regenerate_api_key(
    bot_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Regenerate API Key for this bot."""
    await verify_bot_owner(bot_id, current_user.id, db)
    
    # Deactivate old keys
    await db.execute(
        update(ApiKey)
        .where(ApiKey.bot_id == bot_id)
        .values(is_active=False)
    )
    
    # Generate new
    raw, hashed, prefix, key_encrypted = generate_api_key()
    db.add(ApiKey(bot_id=bot_id, key_hash=hashed, prefix=prefix, key_encrypted=key_encrypted))
    await db.commit()
    
    return {"api_key": raw, "prefix": prefix}

# ---------------------------------------------------------------------------
# Document Endpoints (Phase 2 tweaks)
# ---------------------------------------------------------------------------

@router.get("/bots/{bot_id}/documents", response_model=DocumentListResponse)
async def list_bot_documents(
    bot_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """List indexed documents for a bot."""
    await verify_bot_owner(bot_id, current_user.id, db)
    result = await db.execute(
        select(BotDocument)
        .where(BotDocument.bot_id == bot_id)
        .order_by(BotDocument.uploaded_at.desc())
    )
    docs = list(result.scalars().all())
    return DocumentListResponse(
        documents=[DocumentRecord.model_validate(d) for d in docs],
        total=len(docs)
    )

@router.delete("/bots/{bot_id}/documents/{document_id}", status_code=204)
async def delete_bot_document(
    bot_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Delete a document record from metadata."""
    await verify_bot_owner(bot_id, current_user.id, db)
    doc = await db.get(BotDocument, document_id)
    if not doc or doc.bot_id != bot_id:
        raise HTTPException(404, "Document record not found")
    
    await db.delete(doc)
    await db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Chat history endpoints  (dev_guides §3E)
# ---------------------------------------------------------------------------

@router.get("/bots/{bot_id}/sessions")
async def list_bot_sessions(
    bot_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """List all chat sessions for a bot, with message count and last activity."""
    await verify_bot_owner(bot_id, current_user.id, db)
    sessions = await list_sessions(bot_id, db)
    return [SessionSummary(**s) for s in sessions]


@router.get("/bots/{bot_id}/sessions/{session_id}", response_model=ChatHistoryResponse)
async def get_session_history(
    bot_id: uuid.UUID,
    session_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Return up to `limit` messages for a specific session, oldest first."""
    await verify_bot_owner(bot_id, current_user.id, db)
    messages = await get_history(bot_id, session_id, limit, db)
    return ChatHistoryResponse(
        bot_id=bot_id,
        session_id=session_id,
        messages=[MessageRecord.model_validate(m) for m in messages],
        total=len(messages),
    )


@router.delete("/bots/{bot_id}/sessions/{session_id}")
async def delete_bot_session(
    bot_id: uuid.UUID,
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Delete all messages in a session. Returns count of deleted messages."""
    await verify_bot_owner(bot_id, current_user.id, db)
    count = await delete_session(bot_id, session_id, db)
    return {"deleted_messages": count}


# ---------------------------------------------------------------------------
# Analytics endpoint  (dev_guides §4E)
# ---------------------------------------------------------------------------

@router.get("/bots/{bot_id}/analytics", response_model=AnalyticsResponse)
async def get_bot_analytics(
    bot_id: uuid.UUID,
    days: int = Query(30, ge=1, le=90, description="Number of days to look back (max 90)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_dep),
):
    """Return daily usage analytics for a bot over the last N days."""
    await verify_bot_owner(bot_id, current_user.id, db)
    daily = await get_analytics(bot_id, days, db)
    totals = await get_totals(bot_id, db)
    return AnalyticsResponse(
        bot_id=bot_id,
        period_days=days,
        totals=totals,
        daily=[DailyAnalytics.model_validate(r) for r in daily],
    )


# ---------------------------------------------------------------------------
# Legacy router name — keeps backward compat with old router.py
# ---------------------------------------------------------------------------
bots_router = router
