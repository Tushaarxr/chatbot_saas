# Chatbot-as-a-Service Platform: Technical Documentation

## 1. Project Goal
A multi-tenant, standalone Chatbot Platform built in Python, designed to allow users to spawn distinct "Bots" isolated by authentication, datasets, and conversational workflows. The system is designed for **privacy, local execution, and low-latency response cycles.**

---

## 2. Platform Architecture

### Component Stack
- **Web Framework:** FastAPI + Uvicorn (Async API)
- **Database (Relational):** PostgreSQL 15+ (SQLAlchemy 2.0 Async)
- **Database (Cache/Search):** Redis (Semantic caching & Rate Limiting)
- **Vector Storage:** Local FAISS execution
- **LLM Provider:** Local integration via LM Studio (ex. `qwen2.5-3b-instruct`)
- **Authentication:** JWT (RS256/HS256) + BCrypt password hashing (passlib)
- **ML Layers:**
    - Embeddings: `BGE-small-en-v1.5`
    - Intent Classification: `DistilBERT` (Fine-tuned on the fly)

### Directory Structure & Layers
- `api/`: Endpoint layer (Auth, Bot Management, Chat Query).
- `core/`: Global configuration, logging, and security settings.
- `db/`: Database models, async engine, and migration runner.
- `models/`: Pydantic V2 schemas for absolute request/response validation.
- `services/`: Business logic layer.
    - `auth_service.py`: Password hashing & JWT lifecycle.
    - `history_service.py`: Persistent chat message management.
    - `analytics_service.py`: Daily usage counter logic.
    - `bot_service.py`: User-scoped CRUD operations.
    - `query_router.py`: LLM vs. Cache vs. Intent routing logic.
- `rag/`: Document ingestion, chunking, and LangGraph workflow nodes.
- `intent/`: CPU-based fine-tuning and inference for sequence classification.

---

## 3. Data Models (PostgreSQL)

The platform utilizes 5 relational tables with strict foreign key constraints and cascaded deletes:

| Table | Purpose |
|-------|---------|
| `users` | Registered platform managers (Email, Password Hash). |
| `bots` | Bot configurations (Type, Prompt, Owner ID). Supports soft-deletes. |
| `api_keys` | Hashed keys used by third-party apps to access specific bots. |
| `messages` | Persistent chat history for every conversation turn. |
| `bot_analytics` | Daily usage counters (Queries, Cache hits, Intent vs RAG). |

---

## 4. Primary API Workflows

### A. Authentication & Management (`/auth`)
Users must register and login to manage bots. All `/platform` endpoints are protected by **JWT Bearer Authentication**.
- `POST /auth/register`: Create a platform account.
- `POST /auth/login`: Exchange credentials for a JWT.

### B. Bot Lifecycle (`/platform/bots`)
- **CRUD**: Full support for Create, List, Patch (partial update), and Delete (soft-delete).
- **Data Ingestion**:
    - **RAG**: PDF/TXT upload with automatic chunking and indexing into isolated FAISS namespaces.
    - **Intent**: Fine-tune a local DistilBERT model with JSON-provided training examples.
- **Insights**:
    - **History**: Retrieve distinct sessions and full message logs.
    - **Analytics**: Graph-ready daily usage data for the last N days.

### C. Client Chat (`/v1/chat`)
Authenticated via `X-API-Key` for low-latency client integration.
- **Standard**: JSON response with source attribution (Cache/Intent/RAG).
- **Streaming**: Server-Sent Events (SSE) for typewriter-effect generation.

---

## 5. Security & Resilience

### Hardened Defenses
- **JWT Protection**: All management endpoints require a signed token.
- **Ownership Checks**: Users can only see, edit, or retrieve analytics for bots they own.
- **File Security**: 20MB file size limit + strict MIME-type validation (`application/pdf`, `text/plain`).
- **Global Error Handling**: Custom exception handlers ensure stack traces never leak to the client; only structured JSON errors reach the user.

### Failure Handling
- **Redis Resilience**: If Redis is offline, the platform automatically bypasses caching and rate-limiting without interrupting service.
- **Pydantic Validation**: All inputs (intent labels, names, queries) are sanitized and validated against length and pattern constraints.

---

## 6. Verification & Quality Assurance

The platform includes a comprehensive verification suite (**`test_platform_full.py`**).

### Latest Test Results (2026-04-13)
- **Auth Flow**: PASSED
- **Bot Management (Authenticated)**: PASSED
- **Intent Training & Chat**: PASSED
- **Persistent History Retrieval**: PASSED
- **Analytics Accumulation**: PASSED
- **Security Hardening (Invalid Token/Key/File)**: PASSED

**Result:** The backend is verified stable and ready for frontend integration.
