# CHATBOT PLATFORM — TWEAKS, OPTIMIZATIONS & FUTURE ROADMAP
> **Status**: Frontend + Backend both verified working
> **This document**: Phase 2 changes + future feature roadmap
> **Agent scope**: Implement CURRENT CHANGES section only — Future Roadmap is planning only

---

## ANALYSIS: CAN EACH CHANGE BE INCORPORATED?

```
CHANGE 1 — Persistent API Key visibility        ✅ YES — frontend only
CHANGE 2 — In-tab chat testing (preview)        ✅ YES — frontend + minor backend check
CHANGE 3 — Document list with metadata          ✅ YES — backend addition + frontend
```

**Honest assessment of each:**

CHANGE 1 is pure frontend. The API key was intentionally hidden after first view as
a security pattern (show-once). For a developer-focused tool this is the wrong tradeoff
— developers need to copy keys repeatedly. The fix: store the key in the database
(encrypted or as a retrievable field) and expose a GET endpoint for it. The current
backend only stores the hash. This needs a small backend change.

CHANGE 2 is mostly frontend — the /v1/chat and /v1/chat/stream endpoints already exist.
The only issue is UX: the current Chat page is a separate route. Moving it into each
tab as an inline panel is a frontend-only restructure.

CHANGE 3 requires a backend addition. Currently the backend indexes documents but stores
no metadata (filename, chunk count, upload time, file size). We need a documents table
in PostgreSQL to track this, plus a GET endpoint to list them.

---

## BACKEND CHANGES REQUIRED

### B1 — Expose API Key for Retrieval

```
PROBLEM: api_keys table stores only key_hash + prefix.
         Raw key is generated once and never stored.
         Cannot be retrieved after creation.

SOLUTION: Store an encrypted version of the raw key.
          Use Fernet symmetric encryption (from cryptography package).
          Key encrypted with a server-side secret → reversible only server-side.
          Still never stored as plaintext. Attacker with DB access gets ciphertext only.

ALTERNATIVE (simpler): Let developers regenerate a new key on demand.
          Old key is revoked, new one issued. Simpler but disruptive.

RECOMMENDED: Encrypted storage — developer experience wins here.
```

#### B1a — New dependency

```txt
# append to requirements.txt
cryptography==42.0.8
```

#### B1b — New env var

```bash
# append to .env
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
API_KEY_ENCRYPTION_SECRET=your-fernet-key-here
```

#### B1c — Modify `db/postgres.py`

```
In ApiKey ORM model, ADD column:
    key_encrypted: Mapped[str]    # Fernet-encrypted raw key, nullable=False
```

#### B1d — Modify `services/api_key_service.py`

```
ADD imports:
    from cryptography.fernet import Fernet
    fernet = Fernet(settings.api_key_encryption_secret.encode())

MODIFY generate() function:
    raw, hashed, prefix = existing logic
    key_encrypted = fernet.encrypt(raw.encode()).decode()
    return raw, hashed, prefix, key_encrypted   ← add 4th return value

ADD new function:
    def decrypt_key(key_encrypted: str) -> str:
        """Decrypt a stored encrypted key. Returns plaintext raw key."""
        return fernet.decrypt(key_encrypted.encode()).decode()

UPDATE callers of generate() in bot_service.py to pass key_encrypted to ApiKey constructor.
```

#### B1e — New endpoint in `api/bots.py`

```
GET /platform/bots/{bot_id}/api-key
    deps: get_current_user
    action:
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
        raw_key = decrypt_key(api_key_row.key_encrypted)
        return {"api_key": raw_key, "prefix": api_key_row.prefix, "created_at": api_key_row.created_at}

POST /platform/bots/{bot_id}/api-key/regenerate
    deps: get_current_user
    action:
        await verify_bot_owner(bot_id, current_user.id, db)
        # Deactivate old key
        await db.execute(
            update(ApiKey)
            .where(ApiKey.bot_id == bot_id)
            .values(is_active=False)
        )
        # Generate new key
        raw, hashed, prefix, key_encrypted = generate()
        db.add(ApiKey(bot_id=bot_id, key_hash=hashed,
                      prefix=prefix, key_encrypted=key_encrypted))
        await db.commit()
        return {"api_key": raw, "prefix": prefix}
        # NOTE: raw key returned once on regenerate — encrypted version stored
```

#### B1f — New schemas in `models/schemas.py`

```
ADD:
class ApiKeyResponse(BaseModel):
    api_key: str
    prefix: str
    created_at: datetime
```

---

### B2 — Document Metadata Storage

```
PROBLEM: When documents are uploaded, the system indexes them into FAISS
         but stores no metadata. The Documents tab has no data to show.

SOLUTION: Add a bot_documents table to track every upload per bot.
```

#### B2a — New ORM model in `db/postgres.py`

```
ADD:

class BotDocument(Base):
    __tablename__ = "bot_documents"
    id:           Mapped[uuid.UUID]  primary_key, default uuid4
    bot_id:       Mapped[uuid.UUID]  ForeignKey("bots.id", ondelete="CASCADE"), indexed
    filename:     Mapped[str]        not null
    file_size_kb: Mapped[int]        not null
    chunk_count:  Mapped[int]        not null
    description:  Mapped[str | None]
    uploaded_at:  Mapped[datetime]   default utcnow

INDEX: idx_documents_bot ON bot_documents(bot_id, uploaded_at DESC)
```

#### B2b — Modify `rag/document_processor.py`

```
MODIFY process_and_index() signature:
    async def process_and_index(
        bot_id: str,
        file_bytes: bytes,
        filename: str,
        description: str = "",
        db: AsyncSession = None,     ← ADD this parameter
    ) -> int:

AFTER chunks are indexed into FAISS, ADD:
    if db:
        db.add(BotDocument(
            bot_id=uuid.UUID(bot_id),
            filename=filename,
            file_size_kb=len(file_bytes) // 1024,
            chunk_count=count,
            description=description or None,
        ))
        await db.commit()

UPDATE caller in api/bots.py to pass db into process_and_index().
```

#### B2c — New endpoints in `api/bots.py`

```
GET /platform/bots/{bot_id}/documents
    deps: get_current_user
    action:
        await verify_bot_owner(bot_id, current_user.id, db)
        result = await db.execute(
            select(BotDocument)
            .where(BotDocument.bot_id == bot_id)
            .order_by(BotDocument.uploaded_at.desc())
        )
        docs = list(result.scalars().all())
        return {"documents": [DocumentRecord.model_validate(d) for d in docs], "total": len(docs)}

DELETE /platform/bots/{bot_id}/documents/{document_id}
    deps: get_current_user
    action:
        await verify_bot_owner(bot_id, current_user.id, db)
        doc = await db.get(BotDocument, document_id)
        if not doc or doc.bot_id != bot_id:
            raise HTTPException(404, "Document record not found")
        await db.delete(doc)
        await db.commit()
        # NOTE: This removes the DB record only.
        # FAISS index is NOT rebuilt — chunks remain searchable.
        # Full FAISS rebuild on delete is a future roadmap item.
        return {"deleted": True}
```

#### B2d — New schemas in `models/schemas.py`

```
ADD:
class DocumentRecord(BaseModel):
    id: UUID
    filename: str
    file_size_kb: int
    chunk_count: int
    description: str | None
    uploaded_at: datetime
    model_config = ConfigDict(from_attributes=True)

class DocumentListResponse(BaseModel):
    documents: list[DocumentRecord]
    total: int
```

---

## FRONTEND CHANGES

### F1 — Integration Tab (persistent API key + snippet combined)

```
CHANGE: Replace the current Snippet tab with a unified "Integration" tab.
        Combines API key management + embed snippets in one place.
        Developer never needs to hunt for their key.
```

#### F1a — New API client function in `api/client.js`

```
ADD:

export async function getApiKey(botId)
    GET /platform/bots/{botId}/api-key
    returns: { api_key, prefix, created_at }

export async function regenerateApiKey(botId)
    POST /platform/bots/{botId}/api-key/regenerate
    returns: { api_key, prefix }
    NOTE: show a confirmation modal before calling this
          "This will revoke the existing key. All apps using it will stop working."
```

#### F1b — Replace `src/pages/BotDetail/tabs/Snippet.jsx` with `Integration.jsx`

```
PURPOSE: Developer hub — API key always visible + code snippets.

RENAME FILE: Snippet.jsx → Integration.jsx
UPDATE import in BotDetail.jsx accordingly.

VISUAL LAYOUT:
┌─────────────────────────────────────────────────────┐
│  Integration                                         │
│                                                       │
│  ── API Key ──────────────────────────────────────── │
│  ┌───────────────────────────────────────────────┐   │
│  │ cbp_AbCdEfGh...  [👁 Show/Hide] [Copy] [Regenerate] │
│  └───────────────────────────────────────────────┘   │
│  Created: April 10, 2026                             │
│                                                       │
│  ── Code Snippets ─────────────────────────────────  │
│  Backend URL: [http://localhost:8001____________]     │
│                                                       │
│  [JavaScript] [Python] [cURL]   ← tab switcher       │
│  ┌───────────────────────────────────────────────┐   │
│  │ // code here                     [Copy]       │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

IMPLEMENT:

On mount:
    call getApiKey(botId) → store in local state
    call getSnippet(botId, baseUrl) → store snippet

API key display:
    Default: masked — show "cbp_AbCd••••••••••••••••••••••••••"
    [Show] button toggles full key visibility
    [Copy] copies full key to clipboard → "Copied!" for 1.5s
    [Regenerate] button:
        Opens ConfirmModal:
            message: "Regenerate API Key?"
            detail: "This revokes the current key immediately. Any app using
                    it will receive 401 errors until updated."
            confirmLabel: "Yes, regenerate"
            danger: true
        On confirm: call regenerateApiKey(botId)
            Update displayed key to new value
            Show green banner: "New key generated. Update your applications."

Snippet section:
    Same as existing Snippet.jsx — tab switcher + code blocks + copy
    Debounced base URL input (500ms) re-fetches snippet
    Snippet automatically uses the current bot_id (not hardcoded)

REMOVE: The "new_bot_api_key" sessionStorage banner in BotDetail.jsx
        It is no longer needed — key is always retrievable from Integration tab.
        Keep the one-time display on CreateBot success for immediate visibility,
        but add text: "You can always find this key in the Integration tab."
```

---

### F2 — Inline Chat Testing Panel

```
CHANGE: Add a collapsible "Test Chat" panel inside Documents tab (for RAG bots)
        and inside Intents tab (for Intent bots).
        Replaces the need to navigate to the separate /bots/:id/chat page for testing.
        The separate Chat page stays — this is an additional convenience panel.
```

#### F2a — New shared component `src/components/ChatPanel.jsx`

```
PURPOSE: Reusable inline chat widget. Used inside Documents and Intents tabs.
         Talks to /v1/chat/{botId} using the bot's API key.

PROPS:
    botId: string
    botType: string        ← "rag" | "persona_rag" | "intent"
    apiKey: string | null  ← if null, show "Load API key from Integration tab"

VISUAL (collapsible — collapsed by default):

[▶ Test Your Bot]  ← click to expand/collapse

When expanded:
┌─────────────────────────────────────────────────┐
│  Test Chat               [Standard] [Stream]    │
│  Session: [test_preview_xxx] (auto-generated)   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ (messages area, max-h-64, overflow-y)    │   │
│  │                                          │   │
│  │ Empty: "Ask something to test your bot"  │   │
│  └──────────────────────────────────────────┘   │
│  [_______________query input___________] [Send] │
│  source badge shows after each response         │
└─────────────────────────────────────────────────┘

IMPLEMENT:
- Collapsed by default: useState(false) for isOpen
- Session ID: "preview_" + random 4 chars, generated once on mount, not changeable
  (keep test sessions distinct from real ones)
- If apiKey is null:
    Show: "API key required. Go to the Integration tab to copy it."
    Disable input
- Mode toggle: Standard (default) vs Stream
- Messages: local state array — cleared when panel collapses (no persistence needed)
- Source badge per assistant message:
    cache  → yellow
    intent → purple
    rag    → blue
- Auto-scroll messages div on new message
- Enter submits, Shift+Enter newline
- sendChat() and streamChat() from api/client.js — same functions used in Chat page

NOTE: ChatPanel does NOT save to history (same API call — backend saves automatically)
      Test sessions WILL appear in History tab — this is fine and expected.
      Consider prefixing session_id with "preview_" so History tab can label them.
```

#### F2b — Add ChatPanel to `Documents.jsx`

```
MODIFY Documents.jsx:

At bottom of the tab, AFTER the upload section, ADD:

    <ChatPanel
        botId={botId}
        botType={bot.bot_type}
        apiKey={apiKey}    ← read from parent BotDetail state (loaded via getApiKey)
    />

Pass apiKey down from BotDetail to each tab as a prop.
BotDetail already calls getApiKey on mount (added in F1) — reuse that state.
```

#### F2c — Add ChatPanel to `Intents.jsx`

```
MODIFY Intents.jsx:

AFTER the training result section (success/failure), ADD:

    {trainingResult && (
        <ChatPanel
            botId={botId}
            botType="intent"
            apiKey={apiKey}
        />
    )}

Show the panel only AFTER training has completed at least once.
Before training: show nothing (no point testing an untrained model).
```

#### F2d — Update `BotDetail.jsx`

```
ADD state: const [apiKey, setApiKey] = useState(null)

ON MOUNT (alongside existing getBot call):
    const keyData = await call(getApiKey, botId)
    if (keyData) setApiKey(keyData.api_key)

PASS apiKey as prop to all tab components:
    <Overview bot={bot} apiKey={apiKey} ... />
    <Documents bot={bot} botId={botId} apiKey={apiKey} ... />
    <Intents botId={botId} apiKey={apiKey} ... />
    etc.
```

---

### F3 — Document List in Documents Tab

```
CHANGE: Documents tab now shows previously uploaded documents with metadata
        before the upload form. Developers can see what's already indexed.
```

#### F3a — New API client function in `api/client.js`

```
ADD:

export async function listDocuments(botId)
    GET /platform/bots/{botId}/documents
    returns: { documents: DocumentRecord[], total }

export async function deleteDocument(botId, documentId)
    DELETE /platform/bots/{botId}/documents/{documentId}
    returns: { deleted: true }
```

#### F3b — Modify `src/pages/BotDetail/tabs/Documents.jsx`

```
EXISTING: Upload area + result message.
ADD: Document list section above the upload area.

NEW VISUAL LAYOUT:
┌─────────────────────────────────────────────────────┐
│  Indexed Documents                   ({total} files) │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 📄 product_manual.pdf                           │ │
│  │    Chunks: 42  ·  Size: 1.2 MB  ·  Apr 10 2026 │ │
│  │    Description: "Product documentation"         │ │
│  │                              [Delete record]    │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ 📄 faq.txt                                      │ │
│  │    Chunks: 8  ·  Size: 14 KB  ·  Apr 9 2026    │ │
│  │                              [Delete record]    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  Empty state: "No documents indexed yet"             │
│                                                       │
│  ── Upload New Document ───────────────────────────  │
│  [existing upload form]                              │
└─────────────────────────────────────────────────────┘

IMPLEMENT:

State: documents list loaded on mount via listDocuments(botId)

Each document row:
    bg-white border rounded-lg p-3 mb-2
    Left: filename (font-medium) + metadata row below
    Metadata: "Chunks: {chunk_count} · Size: {size} · {relative date}"
    Size formatting helper:
        function formatFileSize(kb):
            if kb < 1024: return `${kb} KB`
            return `${(kb/1024).toFixed(1)} MB`
    Right: "Delete record" button (text-red-500, text-sm)

Delete behavior:
    ConfirmModal with message:
        "Remove document record?"
        "This removes the metadata record only. The indexed chunks remain
        searchable until the FAISS index is rebuilt. Upload a replacement
        document to refresh the index."
    On confirm: deleteDocument(botId, doc.id)
    Remove from local list (optimistic UI — no reload needed)

After successful upload:
    Re-fetch listDocuments() to update the list
    (or append the new doc optimistically if you have the response data)

Technical info shown per document:
    chunk_count — how many chunks were created
    file_size_kb — formatted nicely
    uploaded_at — relative time ("2 days ago")
    description — if present, shown in gray italic below filename
```

---

## UPDATED FILE LIST — CHANGES ONLY

```
BACKEND (modified):
  requirements.txt                    ← add cryptography
  .env                                ← add API_KEY_ENCRYPTION_SECRET
  db/postgres.py                      ← add BotDocument ORM model,
                                         add key_encrypted column to ApiKey
  db/migrations.py                    ← add bot_documents table creation
  models/schemas.py                   ← add DocumentRecord, DocumentListResponse,
                                         ApiKeyResponse
  services/api_key_service.py         ← add Fernet encryption/decryption,
                                         update generate() return signature
  services/bot_service.py             ← update create() to use new generate() signature
  rag/document_processor.py           ← add db parameter, save BotDocument on index
  api/bots.py                         ← add GET /documents, DELETE /documents/{id},
                                         GET /api-key, POST /api-key/regenerate
                                         update document upload handler to pass db

FRONTEND (modified or new):
  src/api/client.js                   ← add getApiKey, regenerateApiKey,
                                         listDocuments, deleteDocument
  src/pages/BotDetail.jsx             ← load apiKey on mount, pass to all tabs
  src/pages/BotDetail/tabs/Snippet.jsx → RENAMED to Integration.jsx
  src/pages/BotDetail/tabs/Documents.jsx ← add document list section + ChatPanel
  src/pages/BotDetail/tabs/Intents.jsx  ← add ChatPanel after training success
  src/components/ChatPanel.jsx        ← NEW shared component

BACKEND NEW FILES: none
FRONTEND NEW FILES:
  src/components/ChatPanel.jsx
```

---

## MIGRATION NOTE FOR EXISTING DATA

```
The api_keys table has a new column key_encrypted.
Existing rows will have NULL in this column.

Add this handling in GET /platform/bots/{bot_id}/api-key:

    if not api_key_row.key_encrypted:
        raise HTTPException(
            status_code=404,
            detail="API key was created before encrypted storage was added. "
                   "Use the regenerate endpoint to get a new retrievable key."
        )

Frontend: if getApiKey() returns 404, show:
    "Your API key was created before this feature was added.
     Regenerate a new key to enable persistent access."
    [Regenerate Key] button
```

---

## FUTURE ROADMAP (planning only — do not implement now)

### ROADMAP 1 — Document Upload Customization

```
FEATURE: Let users control chunking parameters before indexing.

UI additions to Documents tab:
  Advanced Settings (collapsed by default):
    Chunk Size:    slider 256–2048, default 1000, step 128
    Chunk Overlap: slider 0–512, default 150, step 32
    Show calculated estimate: "~{estimated_chunks} chunks for this file size"
      estimate = file_size_bytes / (chunk_size * 3)  // rough approximation

Backend additions:
  process_and_index() gains new params: chunk_size: int, chunk_overlap: int
  POST /platform/bots/{id}/documents gains form fields: chunk_size, chunk_overlap
  Store chunk_size + chunk_overlap on BotDocument row (add columns)
  Display per-document in the document list: "Chunk size: 512, Overlap: 50"

BotDocument ORM additions:
  chunk_size: Mapped[int] default 1000
  chunk_overlap: Mapped[int] default 150
```

### ROADMAP 2 — JSON Intent Upload

```
FEATURE: Upload intents from a JSON file instead of the form UI.
         For users with large intent sets (50+ labels).

UI additions to Intents tab:
  Tab switcher: [Form Builder] [Upload JSON]
  Upload JSON panel:
    Download template button → generates and downloads a sample JSON file
    File input (.json only)
    Parse client-side → populate same intents array state as the form
    Show parsed preview: "Parsed 12 intents with 847 total examples"
    Same Train button as form mode

JSON template format:
  [
    {
      "label": "greet",
      "response": "Hello! How can I help?",
      "examples": ["hi", "hello", "hey", "good morning", "howdy"]
    }
  ]

Backend: no changes needed — same POST /intents endpoint accepts same payload
```

### ROADMAP 3 — LLM Parameter Tweaking in Snippet

```
FEATURE: Developers can tune LLM parameters and see the snippet update live.
         Snippet encodes params as query string → backend reads them at runtime.

UI additions to Integration tab:
  Expandable "LLM Parameters" section:
    Temperature:  slider 0.0–1.0, default 0.1, step 0.05
    Max tokens:   slider 128–2048, default 1024, step 128
    Top-p:        slider 0.1–1.0, default 0.9, step 0.05

  Snippet updates in real-time as sliders change:
    Parameters appended to the query endpoint as JSON body fields:
      { query, session_id, temperature, max_tokens, top_p }

Backend additions needed:
  QueryRequest schema: add optional temperature, max_tokens, top_p fields
  query_router.route(): pass these to get_llm() or directly to graph invocation
  lm_studio.py: ChatOpenAI constructor reads per-request params instead of fixed values
  Need to make LLM client non-singleton (or accept overrides per call)

This is non-trivial because the current LLM client is a cached singleton.
Restructure to: get_llm(temperature, max_tokens, top_p) that creates a new
ChatOpenAI instance per call (cheap — no model loading, just config object).
```

### ROADMAP 4 — FAISS Index Rebuild on Document Delete

```
FEATURE: When a document is deleted, its chunks are actually removed from the index.
         Currently chunks persist in FAISS even after DB record deletion.

Implementation:
  Store chunk IDs or document source metadata in FAISS documents
  On delete: reload all BotDocument records for the bot (excluding deleted one)
  Re-embed and rebuild the FAISS index from scratch using stored files
  OR: Store original file bytes in a local files/ directory so re-indexing is possible

This requires storing original files which adds disk space overhead.
Recommended approach: store files in data/bot_files/{bot_id}/{document_id}/
with original filename preserved. On delete, remove the file and rebuild index.

BotDocument ORM addition:
  file_path: Mapped[str]  ← relative path to stored original file
```

### ROADMAP 5 — Real-time Analytics via WebSocket

```
FEATURE: Analytics dashboard refreshes live as queries come in.

Backend:
  Add WebSocket endpoint: GET /ws/analytics/{bot_id}
  After each query in query_router, broadcast updated daily counts
  Auth: pass JWT as query param ?token=... (WebSocket can't set headers)

Frontend:
  In Analytics.jsx: open WebSocket on mount, close on unmount
  On message: update totals and today's daily row without full re-fetch
```

### ROADMAP 6 — User Roles

```
FEATURE: Admin vs Developer roles within the platform.
         Admins can see all bots. Developers see only their own.

Backend additions:
  users.role: Mapped[str] default "developer" CHECK IN ('admin', 'developer')
  get_current_user dependency: attach role to user object
  Admin override in list/get bots: if role == "admin", skip user_id filter

Frontend additions:
  /admin route (protected by role check)
  Admin dashboard: shows all users + all bots + platform-wide analytics
```

---

## QUICK REFERENCE — NEW ENDPOINTS AFTER PHASE 2

```
GET  /platform/bots/{id}/api-key              ← retrieve current encrypted key
POST /platform/bots/{id}/api-key/regenerate   ← revoke + issue new key
GET  /platform/bots/{id}/documents            ← list uploaded documents
DELETE /platform/bots/{id}/documents/{doc_id} ← remove document record
```