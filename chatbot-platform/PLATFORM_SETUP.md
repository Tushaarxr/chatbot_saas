# Chatbot Platform — Setup Guide

## Quick overview

The `backend/` folder adds a **multi-tenant chatbot-as-a-service layer** on top of the existing Adaptive RAG project. It runs on **port 8001**. The original RAG app on port 8000 is **untouched**.

---

## Prerequisites checklist

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Runtime |
| PostgreSQL | 16+ | Bot metadata / API keys |
| Redis | 7+ | Semantic cache + rate limiting |
| LM Studio | latest | Local LLM inference (Qwen2.5-3B) |
| MongoDB | 6+ | Chat session history (existing RAG layer) |

---

## First-time setup

### 1. Create a virtual environment

```bash
# From the project root (Adaptive-Rag/)
python -m venv .venv

# Activate
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate
```

### 2. Install dependencies

```bash
# Step A — PyTorch CPU build first (avoids downloading the 2 GB CUDA version)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Step B — everything else
pip install -r requirements.txt
```

### 3. Configure environment variables

Append these lines to your existing `.env` file (keep existing vars unchanged):

```bash
# === PLATFORM LAYER — append to .env ===

# LM Studio (local LLM)
LM_STUDIO_URL=http://localhost:1234/v1
LLM_PROVIDER=local

# PostgreSQL
POSTGRES_URL=postgresql+asyncpg://chatbot:yourpassword@localhost:5432/chatbot_platform

# Redis
REDIS_URL=redis://localhost:6379

# Storage (FAISS indices + DistilBERT models)
VECTOR_STORE_DIR=./data/vector_stores
INTENT_MODEL_DIR=./data/intent_models

# OpenAI fallback (only needed if LLM_PROVIDER=openai)
# OPENAI_API_KEY=sk-...
```

### 4. Set up PostgreSQL

```sql
-- Run in psql / pgAdmin:
CREATE DATABASE chatbot_platform;
CREATE USER chatbot WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE chatbot_platform TO chatbot;
-- Connect to the database then grant schema privileges (Postgres 15+)
\c chatbot_platform
GRANT ALL ON SCHEMA public TO chatbot;
```

### 5. Set up LM Studio

1. Download LM Studio from https://lmstudio.ai
2. Go to **Search tab** → search `Qwen2.5-3B-Instruct`
3. Download the **Q4_K_M** variant (~2 GB)
4. Go to **Developer tab** → select the model → click **Start Server**
5. Default port: `1234`

---

## Boot order (every run)

```bash
# 1. Start Redis (Windows: use WSL2 or https://github.com/tporadowski/redis/releases)
redis-server

# 2. Start PostgreSQL (usually runs as a system service)
# Windows: check Services → postgresql-x64-16

# 3. Start LM Studio (GUI) — load Qwen2.5-3B-Instruct → Developer tab → Start Server

# 4. Validate all connections
python backend/test_connections.py

# 5. Start the platform backend
uvicorn backend.main:app --port 8001 --reload

# 6. (Optional) Keep original Adaptive RAG on port 8000
uvicorn src.main:app --port 8000 --reload
```

---

## Quick API test

```bash
# Create a RAG bot
curl -X POST http://localhost:8001/platform/bots \
  -H "Content-Type: application/json" \
  -d '{"name": "My Doc Bot", "bot_type": "rag"}'
# → Save the api_key from the response (shown once only!)

# Upload a document
curl -X POST http://localhost:8001/platform/bots/{BOT_ID}/documents \
  -H "X-Description: Product documentation" \
  -F "file=@/path/to/doc.pdf"

# Query the bot
curl -X POST http://localhost:8001/v1/chat/{BOT_ID} \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "What does this document say about pricing?", "session_id": "test-1"}'

# Health check
curl http://localhost:8001/health
```

Interactive API docs: http://localhost:8001/docs

---

## Switching LLM provider

In `.env` change:

```bash
LLM_PROVIDER=openai    # uses gpt-4o via OPENAI_API_KEY
LLM_PROVIDER=local     # uses LM Studio (default)
```

Then restart the server. No code changes needed.

---

## Adding a new bot type in the future

1. Add the new type literal to `BotType` in `backend/models/schemas.py`
2. Add a new branch in `route_query()` in `backend/platform/query_router.py`
3. Add a new check in `backend/api/bots.py` (document upload / training endpoint)
4. That's it — all other files (middleware, main, router) are unchanged.

---

## Failure modes

| Problem | Effect | Fix |
|---------|--------|-----|
| LM Studio not running | Auto-falls back to OpenAI (if key set) | Start LM Studio |
| Redis offline | Cache + rate limiting disabled, app still works | `redis-server` |
| No documents uploaded | 400 on chat with rag bot | POST /bots/{id}/documents |
| Intent model not trained | 400 on chat with intent bot | POST /bots/{id}/intents |
