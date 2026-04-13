"""
Query router — central dispatcher for all incoming user messages.

Flow:
  1. Check Redis semantic cache (cosine similarity > 0.92 → return cached answer)
  2. Route to intent classifier (intent bots) or RAG graph (rag / persona_rag)
  3. Store the new response in cache with a 1-hour TTL

Redis failures are non-fatal — the app continues without cache or rate limiting.
"""

import json
from uuid import uuid4

import numpy as np
import redis
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.logger import logger
from db.postgres import Bot
from intent.classifier import predict
from llm.embeddings import get_embeddings
from models.schemas import QueryResponse
from rag.graph import run_graph
from rag.prompts import PERSONA_PREFIX
from langchain_core.messages import HumanMessage
from services.history_service import save_turn
from services.analytics_service import record_query

# ---------------------------------------------------------------------------
# Redis client — sync (incr/get/set are fast atomic ops, sync is fine here)
# ---------------------------------------------------------------------------
try:
    _redis = redis.from_url(settings.redis_url, decode_responses=True)
    _redis.ping()
    REDIS_AVAILABLE = True
    logger.info("Redis connected — semantic cache and rate limiting enabled")
except Exception as _exc:
    _redis = None
    REDIS_AVAILABLE = False
    logger.warning(f"Redis unavailable ({_exc}) — cache + rate limiting disabled")


# ---------------------------------------------------------------------------
# Semantic cache helpers
# ---------------------------------------------------------------------------

async def _check_cache(query: str, bot_id: str) -> str | None:
    """Return a cached response if cosine similarity > 0.92, else None."""
    if not REDIS_AVAILABLE:
        return None
    try:
        q_emb = get_embeddings().embed_query(query)
        keys = _redis.keys(f"cache:{bot_id}:*")
        for k in keys:
            raw = _redis.get(k)
            if not raw:
                continue
            stored = json.loads(raw)
            stored_emb = stored["embedding"]
            sim = float(
                np.dot(q_emb, stored_emb)
                / (np.linalg.norm(q_emb) * np.linalg.norm(stored_emb))
            )
            if sim > 0.92:
                logger.info(f"Cache HIT bot={bot_id} sim={sim:.3f}")
                return stored["response"]
    except Exception as exc:
        logger.warning(f"Cache lookup failed: {exc}")
    return None


async def _write_cache(query: str, bot_id: str, response: str) -> None:
    """Store query embedding + response in Redis with 1-hour TTL."""
    if not REDIS_AVAILABLE:
        return
    try:
        emb = get_embeddings().embed_query(query)
        _redis.setex(
            f"cache:{bot_id}:{uuid4()}",
            3600,
            json.dumps({"embedding": emb, "response": response}),
        )
    except Exception as exc:
        logger.warning(f"Cache write failed: {exc}")


# ---------------------------------------------------------------------------
# Main router
# ---------------------------------------------------------------------------

async def route(bot: Bot, query: str, session_id: str, db: AsyncSession = None) -> QueryResponse:
    """
    Dispatch a query to the correct pipeline and return a QueryResponse.

    Args:
        bot:        ORM Bot object.
        query:      The user's input.
        session_id: Conversation session ID.
    """
    bot_id_str = str(bot.id)

    # 1. Semantic cache check
    cached = await _check_cache(query, bot_id_str)
    if cached:
        return QueryResponse(
            answer=cached,
            bot_id=bot.id,
            session_id=session_id,
            source_type="cache",
        )

    # 2. Route by bot type
    if bot.bot_type == "intent":
        result = predict(bot_id_str, query)
        if result["confidence"] >= 0.7:
            answer = (bot.intent_map or {}).get(
                result["label"], "I'm not sure how to help with that."
            )
        else:
            answer = "I'm not sure how to help with that. Could you rephrase?"
        source = "intent"

    else:  # rag or persona_rag
        persona_prefix = ""
        if bot.bot_type == "persona_rag" and bot.persona_prompt:
            persona_prefix = PERSONA_PREFIX.format(
                persona_name=bot.persona_name or "Assistant",
                persona_prompt=bot.persona_prompt,
            )

        state = {
            "messages": [HumanMessage(content=query)],
            "route": "",
            "binary_score": "",
            "context": "",
            "bot_id": bot_id_str,
            "persona_prefix": persona_prefix,
            "rewrite_count": 0,
        }
        result_state = await run_graph(state)
        answer = result_state["messages"][-1].content
        source = "rag"

    # 3. Cache the result
    await _write_cache(query, bot_id_str, answer)

    # 4. Persist history + analytics (only when db is provided)
    if db is not None:
        await save_turn(
            bot_id=bot.id,
            session_id=session_id,
            user_query=query,
            assistant_answer=answer,
            source_type=source,
            db=db,
        )
        await record_query(bot_id=bot.id, source_type=source, db=db)

    return QueryResponse(
        answer=answer,
        bot_id=bot.id,
        session_id=session_id,
        source_type=source,
    )


# ---------------------------------------------------------------------------
# Legacy alias
# ---------------------------------------------------------------------------

async def route_query(bot: Bot, query: str, session_id: str) -> QueryResponse:
    """Deprecated alias for route(). Use route() directly."""
    return await route(bot, query, session_id)
