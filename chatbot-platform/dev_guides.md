# CHATBOT PLATFORM — COMPLETION PROMPT
> **Status**: Core AI engine complete. Management layer incomplete.
> **Agent Task**: Fill missing backend gaps only. Do not rewrite existing working code.
> **Confirmed Working (DO NOT TOUCH)**:
> - `rag/` — LangGraph pipeline, document processor, retriever, prompts
> - `intent/classifier.py` — DistilBERT fine-tune + inference
> - `vector/faiss_store.py` — per-bot FAISS namespacing
> - `llm/lm_studio.py` — LM Studio OpenAI-compat client
> - `llm/embeddings.py` — BGE-small singleton
> - `services/query_router.py` — Redis cache + pipeline dispatch
> - `api/query.py` — `/v1/chat/{bot_id}` + `/v1/chat/{bot_id}/stream`
> - `services/api_key_service.py` — key gen, hash, resolve
> - `db/postgres.py` — SQLAlchemy engine + existing ORM models

---

## AGENT RULES

```
1. Read existing files before writing — never overwrite working code
2. Add to existing files using targeted inserts, not full rewrites
3. Every new DB table needs a migration added to db/migrations.py
4. Every new endpoint needs a schema added to models/schemas.py
5. Confirm each STEP before proceeding to next
6. All functions: async def, typed, one-line docstring minimum
7. Passwords: bcrypt hash only — never store plaintext
8. JWTs: use python-jose, HS256, expiry enforced on every protected route
```

---

## NEW DEPENDENCIES — append to requirements.txt

```txt
python-jose[cryptography]==3.3.0   # JWT encode/decode
passlib[bcrypt]==1.7.4             # password hashing
```

```bash
pip install "python-jose[cryptography]" "passlib[bcrypt]"
```

---

## NEW ENV VARS — append to .env

```bash
# JWT
JWT_SECRET_KEY=replace-this-with-a-long-random-string-min-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080      # 7 days
```

Generate a safe secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## MISSING PIECE 1 — User Authentication

### 1A. New DB table — add to `db/postgres.py`

```
ADD this ORM model alongside existing models (do not remove anything):

class User(Base):
    __tablename__ = "users"
    id:           Mapped[uuid.UUID]  primary_key, default uuid4
    email:        Mapped[str]        unique, not null, indexed
    display_name: Mapped[str]        not null
    password_hash:Mapped[str]        not null   ← bcrypt, never plaintext
    is_active:    Mapped[bool]       default True
    created_at:   Mapped[datetime]   default utcnow

ALSO: add ForeignKey on Bot.user_id → users.id ON DELETE CASCADE
      (Bot table already has user_id column — just add the FK constraint)
```

### 1B. Add to `db/migrations.py`

```
In create_tables(), after existing Base.metadata.create_all:
- Add CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
- Ensure User table is created before Bot table (FK dependency)
- No other changes
```

### 1C. New file — `services/auth_service.py`

```
PURPOSE: Password hashing, JWT creation/verification.

IMPLEMENT:

from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    """Bcrypt hash a plaintext password."""
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt comparison."""
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str, email: str) -> str:
    """Create a signed JWT with user_id + email claims. Expires per JWT_EXPIRE_MINUTES."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

def decode_token(token: str) -> dict:
    """Decode + verify JWT. Raises JWTError on invalid/expired token."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
```

### 1D. New schemas — add to `models/schemas.py`

```
ADD these classes (do not remove existing schemas):

class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=8, max_length=128)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str

class UserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

### 1E. New file — `api/auth.py`

```
PURPOSE: Register + Login endpoints. No protected routes here.

ROUTER: APIRouter(prefix="/auth", tags=["auth"])

POST /auth/register
  body: RegisterRequest
  action:
    1. Check if email already exists → 409 "Email already registered"
    2. hash_password(body.password)
    3. Insert User row → db.add + commit
    4. Return UserResponse (no token — force them to login)
  return: UserResponse, status 201

POST /auth/login
  body: LoginRequest
  action:
    1. Fetch User by email → 401 "Invalid credentials" if not found
       (same error for wrong password — never reveal which failed)
    2. verify_password(body.password, user.password_hash) → 401 if False
    3. Check user.is_active → 403 "Account disabled" if False
    4. create_access_token(str(user.id), user.email)
    5. Return TokenResponse
  return: TokenResponse

GET /auth/me
  headers: Authorization: Bearer <token>  (use get_current_user dependency)
  return: UserResponse of the authenticated user
```

### 1F. New dependency — add to `api/deps.py`

```
ADD this function (keep existing resolve_api_key):

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
    db: AsyncSession = Depends(get_db_dep),
) -> User:
    """Decode JWT and return the authenticated User. Raises 401 on any failure."""
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalid or expired")

    user = await db.get(User, uuid.UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user
```

### 1G. Mount auth router — add to `api/router.py`

```
ADD:
from api.auth import router as auth_router
api_router.include_router(auth_router)
```

---

## MISSING PIECE 2 — Attach Bots to Users + Full Bot CRUD

### 2A. Update `services/bot_service.py`

```
EXISTING: create(), get(), set_intent_map() — keep all, modify create() signature only.

MODIFY create() to accept user_id:
  async def create(data: CreateBotRequest, user_id: uuid.UUID, db: AsyncSession) -> tuple[Bot, str]:
      bot = Bot(**data.model_dump(), user_id=user_id)   ← add user_id here
      ... rest unchanged

ADD these new functions:

async def list_for_user(user_id: uuid.UUID, db: AsyncSession) -> list[Bot]:
    """Return all active bots owned by this user, newest first."""
    result = await db.execute(
        select(Bot)
        .where(Bot.user_id == user_id, Bot.is_active == True)
        .order_by(Bot.created_at.desc())
    )
    return list(result.scalars().all())

async def update(
    bot_id: uuid.UUID,
    user_id: uuid.UUID,
    data: UpdateBotRequest,
    db: AsyncSession,
) -> Bot:
    """Update mutable bot fields. Raises 404 if not found, 403 if wrong owner."""
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    if bot.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your bot")
    update_data = data.model_dump(exclude_unset=True)   # only update provided fields
    for field, value in update_data.items():
        setattr(bot, field, value)
    await db.commit()
    await db.refresh(bot)
    return bot

async def delete(bot_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    """Soft delete — sets is_active=False. Raises 404/403 on bad input."""
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    if bot.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your bot")
    bot.is_active = False
    await db.commit()
    # NOTE: FAISS index and intent model files are NOT deleted here.
    # Add a background cleanup task later if storage becomes a concern.
```

### 2B. New schemas — add to `models/schemas.py`

```
ADD:

class UpdateBotRequest(BaseModel):
    name: str | None = None
    persona_name: str | None = None
    persona_prompt: str | None = None
    system_prompt: str | None = None
    # bot_type is intentionally excluded — changing type post-creation is undefined behaviour

class BotListResponse(BaseModel):
    bots: list[BotResponse]
    total: int
```

### 2C. Update `api/bots.py` — add missing endpoints

```
All existing endpoints stay. ADD:

GET /platform/bots
  deps: get_current_user
  action: bots = await list_for_user(current_user.id, db)
  return: BotListResponse(bots=[BotResponse.model_validate(b) for b in bots], total=len(bots))

PATCH /platform/bots/{bot_id}
  body: UpdateBotRequest
  deps: get_current_user
  action: bot = await update(bot_id, current_user.id, data, db)
  return: BotResponse.model_validate(bot)

DELETE /platform/bots/{bot_id}
  deps: get_current_user
  action: await delete(bot_id, current_user.id, db)
  return: 204 No Content

ALSO update existing POST /platform/bots:
  deps: get_current_user  ← add this dependency
  pass current_user.id into create()
```

---

## MISSING PIECE 3 — Persistent Chat History

### 3A. New DB table — add to `db/postgres.py`

```
ADD alongside existing models:

class Message(Base):
    __tablename__ = "messages"
    id:         Mapped[uuid.UUID]  primary_key, default uuid4
    bot_id:     Mapped[uuid.UUID]  ForeignKey("bots.id", ondelete="CASCADE"), indexed
    session_id: Mapped[str]        not null, indexed
    role:       Mapped[str]        not null  CHECK role IN ('user', 'assistant')
    content:    Mapped[str]        not null
    source_type:Mapped[str]        nullable  # "intent" | "rag" | "cache"
    created_at: Mapped[datetime]   default utcnow, indexed

INDEXES:
  idx_messages_bot_session ON messages(bot_id, session_id)
  idx_messages_created     ON messages(created_at DESC)
```

### 3B. New file — `services/history_service.py`

```
PURPOSE: Save and retrieve persistent chat messages from PostgreSQL.

IMPLEMENT:

async def save_turn(
    bot_id: uuid.UUID,
    session_id: str,
    user_query: str,
    assistant_answer: str,
    source_type: str,
    db: AsyncSession,
) -> None:
    """Persist one user→assistant exchange as two Message rows."""
    db.add(Message(bot_id=bot_id, session_id=session_id,
                   role="user", content=user_query, source_type=None))
    db.add(Message(bot_id=bot_id, session_id=session_id,
                   role="assistant", content=assistant_answer, source_type=source_type))
    await db.commit()

async def get_history(
    bot_id: uuid.UUID,
    session_id: str,
    limit: int = 50,
    db: AsyncSession = None,
) -> list[Message]:
    """Return last N messages for a session, oldest first."""
    result = await db.execute(
        select(Message)
        .where(Message.bot_id == bot_id, Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    return list(result.scalars().all())

async def list_sessions(bot_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    """Return distinct session_ids for a bot with message count and last activity."""
    result = await db.execute(
        select(
            Message.session_id,
            func.count(Message.id).label("message_count"),
            func.max(Message.created_at).label("last_active"),
        )
        .where(Message.bot_id == bot_id)
        .group_by(Message.session_id)
        .order_by(func.max(Message.created_at).desc())
    )
    return [{"session_id": r.session_id,
             "message_count": r.message_count,
             "last_active": r.last_active} for r in result.all()]

async def delete_session(bot_id: uuid.UUID, session_id: str, db: AsyncSession) -> int:
    """Delete all messages in a session. Returns count deleted."""
    result = await db.execute(
        delete(Message)
        .where(Message.bot_id == bot_id, Message.session_id == session_id)
    )
    await db.commit()
    return result.rowcount
```

### 3C. New schemas — add to `models/schemas.py`

```
ADD:

class MessageRecord(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    source_type: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ChatHistoryResponse(BaseModel):
    bot_id: UUID
    session_id: str
    messages: list[MessageRecord]
    total: int

class SessionSummary(BaseModel):
    session_id: str
    message_count: int
    last_active: datetime
```

### 3D. Hook save_turn into query router — modify `services/query_router.py`

```
FIND the route() function. AFTER the return statement is computed (answer is known),
BEFORE returning QueryResponse, add:

    # Persist to PostgreSQL (non-blocking — don't await, use background task)
    # Pass db session from the API layer — update route() signature:

MODIFY route() signature:
    async def route(bot: Bot, query: str, session_id: str, db: AsyncSession) -> QueryResponse:

AFTER answer is determined, add:
    await save_turn(
        bot_id=bot.id,
        session_id=session_id,
        user_query=query,
        assistant_answer=answer,
        source_type=source,
        db=db,
    )

UPDATE callers in api/query.py to pass db into route().
```

### 3E. New history endpoints — add to `api/bots.py`

```
ADD (all require get_current_user to verify bot ownership first):

GET /platform/bots/{bot_id}/sessions
  action:
    await verify_bot_owner(bot_id, current_user.id, db)   ← helper below
    sessions = await list_sessions(bot_id, db)
    return list of SessionSummary

GET /platform/bots/{bot_id}/sessions/{session_id}
  query params: limit: int = 50
  action:
    await verify_bot_owner(bot_id, current_user.id, db)
    messages = await get_history(bot_id, session_id, limit, db)
    return ChatHistoryResponse(bot_id=bot_id, session_id=session_id,
                               messages=[MessageRecord.model_validate(m) for m in messages],
                               total=len(messages))

DELETE /platform/bots/{bot_id}/sessions/{session_id}
  action:
    await verify_bot_owner(bot_id, current_user.id, db)
    count = await delete_session(bot_id, session_id, db)
    return {"deleted_messages": count}

ADD helper at top of api/bots.py:
async def verify_bot_owner(bot_id: UUID, user_id: UUID, db: AsyncSession) -> Bot:
    bot = await db.get(Bot, bot_id)
    if not bot or not bot.is_active:
        raise HTTPException(status_code=404, detail="Bot not found")
    if bot.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return bot
```

---

## MISSING PIECE 4 — Bot Analytics

### 4A. New DB table — add to `db/postgres.py`

```
ADD:

class BotAnalytics(Base):
    __tablename__ = "bot_analytics"
    id:             Mapped[uuid.UUID]  primary_key, default uuid4
    bot_id:         Mapped[uuid.UUID]  ForeignKey("bots.id", ondelete="CASCADE"), indexed
    date:           Mapped[date]       not null   ← calendar date, not datetime
    query_count:    Mapped[int]        default 0
    cache_hits:     Mapped[int]        default 0
    intent_hits:    Mapped[int]        default 0
    rag_hits:       Mapped[int]        default 0

UNIQUE CONSTRAINT: (bot_id, date)  ← one row per bot per day, upsert pattern
INDEX: idx_analytics_bot_date ON bot_analytics(bot_id, date DESC)
```

### 4B. New file — `services/analytics_service.py`

```
PURPOSE: Increment daily counters. Called after every successful query.

IMPLEMENT:

from sqlalchemy.dialects.postgresql import insert as pg_insert

async def record_query(
    bot_id: uuid.UUID,
    source_type: str,   # "intent" | "rag" | "cache"
    db: AsyncSession,
) -> None:
    """Upsert daily analytics row. Increments appropriate counter atomically."""
    today = date.today()
    stmt = pg_insert(BotAnalytics).values(
        bot_id=bot_id,
        date=today,
        query_count=1,
        cache_hits=1 if source_type == "cache" else 0,
        intent_hits=1 if source_type == "intent" else 0,
        rag_hits=1 if source_type == "rag" else 0,
    ).on_conflict_do_update(
        index_elements=["bot_id", "date"],
        set_={
            "query_count": BotAnalytics.query_count + 1,
            "cache_hits":  BotAnalytics.cache_hits  + (1 if source_type == "cache"  else 0),
            "intent_hits": BotAnalytics.intent_hits + (1 if source_type == "intent" else 0),
            "rag_hits":    BotAnalytics.rag_hits    + (1 if source_type == "rag"    else 0),
        }
    )
    await db.execute(stmt)
    await db.commit()

async def get_analytics(
    bot_id: uuid.UUID,
    days: int = 30,
    db: AsyncSession = None,
) -> list[BotAnalytics]:
    """Return daily analytics rows for the last N days, newest first."""
    cutoff = date.today() - timedelta(days=days)
    result = await db.execute(
        select(BotAnalytics)
        .where(BotAnalytics.bot_id == bot_id, BotAnalytics.date >= cutoff)
        .order_by(BotAnalytics.date.desc())
    )
    return list(result.scalars().all())

async def get_totals(bot_id: uuid.UUID, db: AsyncSession) -> dict:
    """Return lifetime totals for a bot."""
    result = await db.execute(
        select(
            func.sum(BotAnalytics.query_count).label("total_queries"),
            func.sum(BotAnalytics.cache_hits).label("total_cache_hits"),
            func.sum(BotAnalytics.intent_hits).label("total_intent_hits"),
            func.sum(BotAnalytics.rag_hits).label("total_rag_hits"),
        ).where(BotAnalytics.bot_id == bot_id)
    )
    row = result.one()
    return {
        "total_queries":   row.total_queries or 0,
        "total_cache_hits":row.total_cache_hits or 0,
        "cache_hit_rate":  round((row.total_cache_hits or 0) / max(row.total_queries or 1, 1), 4),
        "total_intent_hits":row.total_intent_hits or 0,
        "total_rag_hits":  row.total_rag_hits or 0,
    }
```

### 4C. New schemas — add to `models/schemas.py`

```
ADD:

class DailyAnalytics(BaseModel):
    date: date
    query_count: int
    cache_hits: int
    intent_hits: int
    rag_hits: int
    model_config = ConfigDict(from_attributes=True)

class AnalyticsResponse(BaseModel):
    bot_id: UUID
    period_days: int
    totals: dict
    daily: list[DailyAnalytics]
```

### 4D. Hook analytics into query router — modify `services/query_router.py`

```
AFTER save_turn() call (added in 3D), ADD:

    await record_query(bot_id=bot.id, source_type=source, db=db)

IMPORT: from services.analytics_service import record_query
```

### 4E. Analytics endpoint — add to `api/bots.py`

```
ADD:

GET /platform/bots/{bot_id}/analytics
  query params: days: int = 30  (max 90, enforced with Field(le=90))
  deps: get_current_user
  action:
    await verify_bot_owner(bot_id, current_user.id, db)
    daily = await get_analytics(bot_id, days, db)
    totals = await get_totals(bot_id, db)
    return AnalyticsResponse(
        bot_id=bot_id,
        period_days=days,
        totals=totals,
        daily=[DailyAnalytics.model_validate(r) for r in daily]
    )
```

---

## MISSING PIECE 5 — Security Hardening

### 5A. Input validation — add to `models/schemas.py`

```
MODIFY these existing schemas (add Field constraints):

CreateBotRequest:
  name: str = Field(min_length=1, max_length=100, pattern=r'^[\w\s\-]+$')
  persona_name: str | None = Field(default=None, max_length=50)
  persona_prompt: str | None = Field(default=None, max_length=2000)
  system_prompt: str | None = Field(default=None, max_length=2000)

QueryRequest:
  query: str = Field(min_length=1, max_length=2000)
  session_id: str = Field(default="default", max_length=100, pattern=r'^[\w\-]+$')

IntentItem:
  label: str = Field(min_length=1, max_length=50, pattern=r'^[\w_]+$')
  examples: list[str] = Field(min_length=5, max_length=100)
  response: str = Field(min_length=1, max_length=500)

  @field_validator("examples")
  @classmethod
  def min_five_examples(cls, v):
      if len(v) < 5:
          raise ValueError("Each intent label requires at least 5 training examples")
      return v
```

### 5B. File upload hardening — modify `api/bots.py` document upload endpoint

```
FIND: POST /platform/bots/{bot_id}/documents
ADD these checks at the top of the handler, before any processing:

MAX_FILE_SIZE = 20 * 1024 * 1024   # 20 MB hard limit
ALLOWED_EXTENSIONS = {".pdf", ".txt"}
ALLOWED_MIME_TYPES = {"application/pdf", "text/plain"}

file_bytes = await file.read()

if len(file_bytes) == 0:
    raise HTTPException(status_code=400, detail="File is empty")

if len(file_bytes) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

suffix = Path(file.filename).suffix.lower()
if suffix not in ALLOWED_EXTENSIONS:
    raise HTTPException(status_code=415, detail=f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}")

if file.content_type not in ALLOWED_MIME_TYPES:
    raise HTTPException(status_code=415, detail="MIME type does not match file extension")
```

### 5C. Global exception handler — add to `main.py`

```
ADD after app = FastAPI(...):

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation failed", "errors": exc.errors()}
    )

@app.exception_handler(Exception)
async def generic_error_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
        # Never expose exc details to client in production
    )
```

### 5D. Bot ownership check on public query endpoint — modify `api/query.py`

```
FIND: POST /v1/chat/{bot_id}
FIND: POST /v1/chat/{bot_id}/stream

In both handlers, AFTER resolve_api_key dependency resolves `bot`:
ADD this check:

if str(bot.id) != str(bot_id):
    raise HTTPException(status_code=403, detail="API key does not belong to this bot")

if not bot.is_active:
    raise HTTPException(status_code=403, detail="Bot is disabled")
```

### 5E. Add settings fields — modify `core/config.py`

```
ADD to Settings class:

jwt_secret_key: str
jwt_algorithm: str = "HS256"
jwt_expire_minutes: int = 10080
max_file_size_mb: int = 20
```

---

## FINAL: Update `db/migrations.py`

```
MODIFY create_tables() to ensure table creation order respects FK dependencies:
Order: User → Bot → ApiKey → Message → BotAnalytics

Also add this after create_all():
    logger.info("All tables verified/created: users, bots, api_keys, messages, bot_analytics")
```

---

## FINAL: Update `api/router.py`

```
Ensure all routers are mounted:

from api.auth import router as auth_router
from api.bots import router as bots_router
from api.query import router as query_router

api_router = APIRouter()
api_router.include_router(auth_router)   ← NEW
api_router.include_router(bots_router)
api_router.include_router(query_router)
```

---

## COMPLETE ENDPOINT SURFACE AFTER ALL CHANGES

```
AUTH
  POST   /auth/register              ← NEW
  POST   /auth/login                 ← NEW
  GET    /auth/me                    ← NEW

PLATFORM (requires JWT Bearer token)
  POST   /platform/bots              ← UPDATED (now requires auth, attaches user_id)
  GET    /platform/bots              ← NEW (list user's bots)
  GET    /platform/bots/{id}         ← existing
  PATCH  /platform/bots/{id}         ← NEW
  DELETE /platform/bots/{id}         ← NEW (soft delete)
  GET    /platform/bots/{id}/snippet ← existing

DATA PIPELINES (requires JWT Bearer token)
  POST   /platform/bots/{id}/documents    ← existing + hardened validation
  POST   /platform/bots/{id}/intents      ← existing

HISTORY (requires JWT Bearer token)
  GET    /platform/bots/{id}/sessions                  ← NEW
  GET    /platform/bots/{id}/sessions/{session_id}     ← NEW
  DELETE /platform/bots/{id}/sessions/{session_id}     ← NEW

ANALYTICS (requires JWT Bearer token)
  GET    /platform/bots/{id}/analytics?days=30         ← NEW

QUERY (requires X-API-Key header, not JWT)
  POST   /v1/chat/{bot_id}           ← existing + ownership check
  POST   /v1/chat/{bot_id}/stream    ← existing + ownership check

SYSTEM
  GET    /health                     ← existing
```

---

## NEW FILES SUMMARY

```
services/auth_service.py        ← NEW
services/history_service.py     ← NEW
services/analytics_service.py   ← NEW
api/auth.py                     ← NEW
```

## MODIFIED FILES SUMMARY

```
db/postgres.py          ← ADD User, Message, BotAnalytics ORM models
db/migrations.py        ← ADD new tables, fix creation order
models/schemas.py       ← ADD new schemas, ADD Field constraints to existing
services/bot_service.py ← MODIFY create(), ADD list_for_user(), update(), delete()
services/query_router.py← MODIFY route() signature, ADD save_turn() + record_query() calls
api/bots.py             ← ADD 8 new endpoints, ADD verify_bot_owner() helper
api/query.py            ← ADD ownership + is_active checks, pass db to route()
api/deps.py             ← ADD get_current_user() dependency
api/router.py           ← ADD auth router mount
core/config.py          ← ADD JWT + file size settings
main.py                 ← ADD exception handlers
requirements.txt        ← ADD python-jose, passlib
.env                    ← ADD JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_MINUTES
```

---

## WHAT IS NOT CHANGED

```
rag/                    ← untouched
intent/                 ← untouched
vector/                 ← untouched
llm/                    ← untouched
api/query.py routes     ← logic untouched, only guards added at top
```