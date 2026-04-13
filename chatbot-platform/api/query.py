"""
Public chat API — endpoints that end-users (and their apps) call.
All routes are prefixed with /v1 (mounted in router.py).
Authentication is enforced via the resolve_api_key dependency from deps.py.

Per dev_guides.md §3D (pass db to route) and §5D (ownership + is_active guards).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db_dep, resolve_api_key
from db.postgres import Bot
from llm.lm_studio import get_llm
from models.schemas import QueryRequest, QueryResponse
from services.query_router import route

router = APIRouter(prefix="/v1", tags=["query"])


# ---------------------------------------------------------------------------
# POST /v1/chat/{bot_id} — standard (non-streaming) query
# ---------------------------------------------------------------------------

@router.post("/chat/{bot_id}", response_model=QueryResponse)
async def chat(
    bot_id: uuid.UUID,
    req: QueryRequest,
    bot: Bot = Depends(resolve_api_key),
    db: AsyncSession = Depends(get_db_dep),
):
    """
    Send a message to a bot and receive a complete answer.
    The X-API-Key header must belong to the specified bot_id.
    """
    # dev_guides §5D — ownership + active check
    if str(bot.id) != str(bot_id):
        raise HTTPException(status_code=403, detail="API key does not belong to this bot")
    if not bot.is_active:
        raise HTTPException(status_code=403, detail="Bot is disabled")

    return await route(bot, req.query, req.session_id, db)


# ---------------------------------------------------------------------------
# POST /v1/chat/{bot_id}/stream — streaming query (Server-Sent Events)
# ---------------------------------------------------------------------------

@router.post("/chat/{bot_id}/stream")
async def chat_stream(
    bot_id: uuid.UUID,
    req: QueryRequest,
    bot: Bot = Depends(resolve_api_key),
    db: AsyncSession = Depends(get_db_dep),
):
    """
    Stream the bot's answer token-by-token using Server-Sent Events.

    - Intent bots: wraps the full answer in a single SSE event (no LLM streaming).
    - RAG bots: streams tokens from the LLM via LangChain's astream interface.
    """
    # dev_guides §5D — ownership + active check
    if str(bot.id) != str(bot_id):
        raise HTTPException(status_code=403, detail="API key does not belong to this bot")
    if not bot.is_active:
        raise HTTPException(status_code=403, detail="Bot is disabled")

    if bot.bot_type == "intent":
        async def intent_gen():
            """Return a single SSE event for intent bots (no token streaming)."""
            result = await route(bot, req.query, req.session_id, db)
            yield f"data: {result.answer}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(intent_gen(), media_type="text/event-stream")

    # RAG / persona_rag — stream tokens from LM Studio
    async def token_stream():
        """Stream LLM tokens as SSE events."""
        llm = get_llm()
        messages = [HumanMessage(content=req.query)]
        try:
            async for chunk in llm.astream(messages):
                if chunk.content:
                    yield f"data: {chunk.content}\n\n"
        except Exception:
            # Streaming failed — fall back to a full synchronous response
            result = await route(bot, req.query, req.session_id, db)
            yield f"data: {result.answer}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")


# Legacy alias
query_router = router
