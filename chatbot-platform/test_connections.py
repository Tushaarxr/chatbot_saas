"""
Pre-flight service checker — run this before starting uvicorn.
Prints a clear pass/fail for each external dependency.

Usage:
    python backend/test_connections.py
"""

import asyncio

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


async def main() -> None:
    """Check all external services and print status."""
    print("\n=== Chatbot Platform - Pre-flight Check ===\n")

    # 1. LM Studio
    try:
        resp = httpx.get(f"{settings.lm_studio_url}/models", timeout=3.0)
        data = resp.json()
        if "data" in data and len(data["data"]) > 0:
            model_id = data["data"][0]["id"]
            print(f"[OK] LM Studio     | model: {model_id}")
        else:
            print(f"[FAIL] LM Studio     | Check LM Studio server. Expected 'data' key, got: {data}")
    except Exception as exc:
        print(f"[FAIL] LM Studio     | not running - open LM Studio -> Developer -> Start Server")
        print(f"                  ({exc})")

    # 2. PostgreSQL
    try:
        engine = create_async_engine(settings.postgres_url, echo=False)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        print("[OK] PostgreSQL    | connected")
    except Exception as exc:
        print(f"[FAIL] PostgreSQL    | check POSTGRES_URL in .env")
        print(f"                  ({exc})")

    # 3. Redis
    try:
        import redis as sync_redis
        r = sync_redis.from_url(settings.redis_url, decode_responses=True)
        r.ping()
        print("[OK] Redis         | connected")
    except Exception as exc:
        print("[WARN] Redis         | offline - cache and rate limiting disabled (non-fatal)")
        print(f"                  ({exc})")

    # 4. Embeddings model
    try:
        from llm.embeddings import get_embeddings
        get_embeddings().embed_query("test")
        print("[OK] Embeddings    | BGE-small-en-v1.5 loaded")
    except Exception as exc:
        print(f"[FAIL] Embeddings    | run: pip install sentence-transformers")
        print(f"                  ({exc})")

    print("\n-> Start the server: uvicorn main:app --port 8001 --reload\n")


if __name__ == "__main__":
    asyncio.run(main())
