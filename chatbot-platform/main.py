"""
FastAPI application entry point for the standalone chatbot platform.

Runs on port 8001 — does NOT conflict with Adaptive-Rag on port 8000.

Start command:
    uvicorn main:app --port 8001 --reload
"""

from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from core.config import settings
from core.logger import logger
from db.migrations import create_tables
from llm.lm_studio import get_llm

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Chatbot Platform API",
    version="1.0.0",
    description=(
        "Multi-tenant chatbot-as-a-service. "
        "Three bot types: intent, rag, persona_rag. "
        "Powered by LM Studio (local LLM) + FAISS + DistilBERT."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow all origins for local development (tighten in production)
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Mount routers
# ---------------------------------------------------------------------------

app.include_router(api_router)


# ---------------------------------------------------------------------------
# Global exception handlers  (dev_guides §5C)
# ---------------------------------------------------------------------------

from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    """Return structured 422 without leaking internal schema details."""
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation failed",
            "errors": jsonable_encoder(exc.errors())
        },
    )


@app.exception_handler(Exception)
async def generic_error_handler(request, exc):
    """Catch-all: log the error but never expose the traceback to clients."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# ---------------------------------------------------------------------------
# Startup event
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    """Run once when the server starts: create tables, ensure directories exist."""
    logger.info("=== Chatbot Platform starting up ===")

    # Create PostgreSQL tables (idempotent — safe to call every restart)
    await create_tables()

    # Ensure FAISS + model storage directories exist
    Path(settings.vector_store_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.intent_model_dir).mkdir(parents=True, exist_ok=True)

    # Log which LLM we'll be using and trigger connection check at startup
    logger.info(f"LLM provider: {settings.llm_provider}")
    if settings.llm_provider == "local":
        get_llm()   # triggers LM Studio connection + model detection

    logger.info("=== Startup complete. API docs: http://localhost:8001/docs ===")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"])
async def health():
    """Quick health check endpoint."""
    return {"status": "ok", "llm_provider": settings.llm_provider}


# ---------------------------------------------------------------------------
# Dev runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
