# CHATBOT PLATFORM — FRONTEND BUILD GUIDE
> **AI Agent Target**: Cursor / Claude / Copilot / Windsurf
> **Backend**: Verified stable at `http://localhost:8001` (all tests passing)
> **Frontend stack**: React + Vite + TailwindCSS
> **Design philosophy**: Clean, minimal, functional — no over-engineering

---

## AGENT RULES

```
1. This is a standalone frontend project — no backend code lives here
2. All API calls go to http://localhost:8001 (configurable via .env)
3. Never hardcode API URLs — always use the VITE_API_BASE_URL env var
4. JWT token lives in localStorage key "cbp_token" — read it on every protected request
5. If JWT is missing or 401 is returned — redirect to /login immediately
6. Every API call must handle loading state and error state — no silent failures
7. Keep components small and single-purpose
8. No component library (no MUI, no Chakra) — plain Tailwind only
9. Confirm each STEP before proceeding to next
```

---

## FINAL FOLDER STRUCTURE

```
chatbot-platform-frontend/
│
├── .env                          ← VITE_API_BASE_URL=http://localhost:8001
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
│
└── src/
    ├── main.jsx                  ← ReactDOM root, BrowserRouter
    ├── App.jsx                   ← Route definitions
    │
    ├── api/
    │   └── client.js             ← All fetch calls to backend, one function per endpoint
    │
    ├── context/
    │   └── AuthContext.jsx       ← JWT state, login(), logout(), currentUser
    │
    ├── hooks/
    │   ├── useAuth.js            ← consume AuthContext
    │   └── useApi.js             ← generic fetch wrapper with loading/error state
    │
    ├── components/
    │   ├── Layout.jsx            ← Sidebar + top bar shell
    │   ├── ProtectedRoute.jsx    ← Redirect to /login if no token
    │   ├── Spinner.jsx           ← Loading indicator
    │   ├── ErrorBanner.jsx       ← Dismissible error message
    │   └── ConfirmModal.jsx      ← Reusable "Are you sure?" dialog
    │
    └── pages/
        ├── Login.jsx             ← POST /auth/login
        ├── Register.jsx          ← POST /auth/register
        ├── Dashboard.jsx         ← GET /platform/bots (bot list + create button)
        ├── CreateBot.jsx         ← POST /platform/bots
        ├── BotDetail.jsx         ← Shell page with tab navigation
        │   ├── tabs/
        │   │   ├── Overview.jsx      ← Bot info + PATCH + DELETE
        │   │   ├── Documents.jsx     ← POST /platform/bots/{id}/documents
        │   │   ├── Intents.jsx       ← POST /platform/bots/{id}/intents
        │   │   ├── History.jsx       ← GET sessions + GET messages
        │   │   ├── Analytics.jsx     ← GET /platform/bots/{id}/analytics
        │   │   └── Snippet.jsx       ← GET /platform/bots/{id}/snippet
        │
        ├── Chat.jsx              ← POST /v1/chat/{bot_id} (demo chat UI)
        └── NotFound.jsx          ← 404 fallback
```

---

## SETUP

```bash
npm create vite@latest chatbot-platform-frontend -- --template react
cd chatbot-platform-frontend
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install react-router-dom
```

**tailwind.config.js** — set content paths:
```js
content: ["./index.html", "./src/**/*.{js,jsx}"]
```

**src/index.css** — add at top:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**.env**:
```
VITE_API_BASE_URL=http://localhost:8001
```

---

## STEP 1 — `src/api/client.js`

```
PURPOSE: Single file for ALL backend API calls.
         No fetch() calls anywhere else in the codebase — only here.

PATTERN for every function:
  - Read token from localStorage.getItem("cbp_token")
  - Set Authorization: Bearer {token} header on all /platform and /auth/me calls
  - /v1/chat/* uses X-API-Key header instead
  - On 401 response: dispatch a custom window event "auth:expired" and throw
  - Return parsed response JSON on success
  - Throw an Error with response.json().detail as message on non-2xx

IMPLEMENT these functions (group by section with comments):

// AUTH
export async function register(email, displayName, password)
  POST /auth/register
  body: { email, display_name: displayName, password }
  returns: user object

export async function login(email, password)
  POST /auth/login
  body: { email, password }
  returns: { access_token, token_type, user_id, email }

export async function getMe()
  GET /auth/me
  returns: user object

// BOTS
export async function listBots()
  GET /platform/bots
  returns: { bots: [], total: number }

export async function createBot(name, botType, personaName, personaPrompt, systemPrompt)
  POST /platform/bots
  returns: bot object with api_key

export async function getBot(botId)
  GET /platform/bots/{botId}
  returns: bot object

export async function updateBot(botId, fields)
  PATCH /platform/bots/{botId}
  body: fields (only send non-null values)
  returns: updated bot object

export async function deleteBot(botId)
  DELETE /platform/bots/{botId}
  returns: nothing (204)

// DOCUMENTS
export async function uploadDocument(botId, file, description)
  POST /platform/bots/{botId}/documents
  body: FormData with file + X-Description header
  returns: { chunks_indexed, filename }

// INTENTS
export async function trainIntents(botId, intents)
  POST /platform/bots/{botId}/intents
  body: { intents: [{ label, examples, response }] }
  returns: { status, labels, accuracy }

// HISTORY
export async function listSessions(botId)
  GET /platform/bots/{botId}/sessions
  returns: list of { session_id, message_count, last_active }

export async function getSession(botId, sessionId, limit=50)
  GET /platform/bots/{botId}/sessions/{sessionId}?limit={limit}
  returns: { messages: [], total }

export async function deleteSession(botId, sessionId)
  DELETE /platform/bots/{botId}/sessions/{sessionId}
  returns: { deleted_messages }

// ANALYTICS
export async function getAnalytics(botId, days=30)
  GET /platform/bots/{botId}/analytics?days={days}
  returns: { totals, daily: [], period_days }

// SNIPPET
export async function getSnippet(botId, baseUrl)
  GET /platform/bots/{botId}/snippet?base_url={baseUrl}
  returns: { javascript, python_code, curl }

// CHAT (uses X-API-Key not JWT)
export async function sendChat(botId, apiKey, query, sessionId)
  POST /v1/chat/{botId}
  header: X-API-Key: {apiKey}
  body: { query, session_id: sessionId }
  returns: { answer, source_type }

export function streamChat(botId, apiKey, query, sessionId, onToken, onDone)
  POST /v1/chat/{botId}/stream
  header: X-API-Key: {apiKey}
  Uses fetch + ReadableStream to read SSE tokens
  Calls onToken(token) for each "data: " line
  Calls onDone() when "data: [DONE]" received
  returns: cleanup function
```

---

## STEP 2 — `src/context/AuthContext.jsx`

```
PURPOSE: Global auth state. Provides token, user, login(), logout().

IMPLEMENT:
const AuthContext = createContext(null)

Provider state:
  token: string | null        ← localStorage.getItem("cbp_token") on mount
  user: object | null         ← populated by getMe() after login or on refresh
  loading: bool               ← true while fetching user on startup

login(email, password):
  1. call login() from client.js
  2. save token to localStorage
  3. call getMe() to populate user state
  4. return (no redirect — let the caller navigate)

logout():
  1. remove "cbp_token" from localStorage
  2. set token and user to null
  3. navigate to /login

On mount (useEffect):
  if token exists in localStorage:
    call getMe() — if it fails (401), call logout()
  set loading = false

Also listen for window event "auth:expired":
  call logout() automatically

export useAuth hook:
  export function useAuth() { return useContext(AuthContext) }
```

---

## STEP 3 — `src/hooks/useApi.js`

```
PURPOSE: Generic hook to wrap any client.js call with loading + error state.

IMPLEMENT:
export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function call(apiFn, ...args) {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFn(...args)
      return result
    } catch (err) {
      setError(err.message || "Something went wrong")
      return null
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, call, clearError: () => setError(null) }
}
```

---

## STEP 4 — `src/components/Layout.jsx`

```
PURPOSE: App shell — sidebar nav + top bar. Wraps all protected pages.

VISUAL STRUCTURE (Tailwind):
┌─────────────────────────────────────────────────┐
│  SIDEBAR (w-56, bg-gray-900, text-white)         │
│  ┌───────────────────────────────────────────┐   │
│  │ Logo: "ChatBots" (top left, bold)         │   │
│  │                                           │   │
│  │ Nav links:                                │   │
│  │   Dashboard  (links to /)                 │   │
│  │                                           │   │
│  │ (bottom) User email + Logout button       │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  MAIN AREA (flex-1, bg-gray-50, overflow-y-auto)  │
│  ┌───────────────────────────────────────────┐   │
│  │ Top bar: current page title (h1, gray-800)│   │
│  │ Content slot ({children})                 │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘

IMPLEMENT:
- Sidebar uses NavLink from react-router-dom
  active link: bg-gray-700 rounded
- User email from useAuth().user?.email
- Logout button calls useAuth().logout()
- Props: title (string), children
```

---

## STEP 5 — `src/components/ProtectedRoute.jsx`

```
PURPOSE: Redirect unauthenticated users to /login.

IMPLEMENT:
function ProtectedRoute({ children }) {
  const { token, loading } = useAuth()
  if (loading) return <Spinner />
  if (!token) return <Navigate to="/login" replace />
  return children
}
```

---

## STEP 6 — `src/components/Spinner.jsx`

```
PURPOSE: Simple centered loading spinner.

IMPLEMENT:
Tailwind: animate-spin, border-4, border-blue-500, border-t-transparent
Rounded full circle, w-8 h-8
Centered with flex justify-center items-center
```

---

## STEP 7 — `src/components/ErrorBanner.jsx`

```
PURPOSE: Red dismissible error banner shown at top of any page.

IMPLEMENT:
Props: message (string), onDismiss (function)
Tailwind: bg-red-50, border border-red-300, text-red-700, rounded, p-3
Show X button on right that calls onDismiss
Only renders if message is non-null
```

---

## STEP 8 — `src/components/ConfirmModal.jsx`

```
PURPOSE: "Are you sure?" dialog — used for delete actions.

IMPLEMENT:
Props: message, onConfirm, onCancel, confirmLabel="Delete", danger=true

Overlay: fixed inset-0 bg-black/40 flex items-center justify-center z-50
Modal: bg-white rounded-xl p-6 w-80 shadow-xl
Buttons:
  Cancel: text-gray-600, hover:bg-gray-100
  Confirm: bg-red-600 text-white hover:bg-red-700 (if danger=true)
            bg-blue-600 text-white hover:bg-blue-700 (if danger=false)
```

---

## STEP 9 — `src/App.jsx`

```
PURPOSE: Route definitions.

IMPLEMENT:
<AuthProvider>
  <BrowserRouter>
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={
        <ProtectedRoute><Layout title="Dashboard"><Dashboard /></Layout></ProtectedRoute>
      }/>

      <Route path="/bots/new" element={
        <ProtectedRoute><Layout title="Create Bot"><CreateBot /></Layout></ProtectedRoute>
      }/>

      <Route path="/bots/:botId" element={
        <ProtectedRoute><Layout title="Bot Detail"><BotDetail /></Layout></ProtectedRoute>
      }/>

      <Route path="/bots/:botId/chat" element={
        <ProtectedRoute><Layout title="Chat Demo"><Chat /></Layout></ProtectedRoute>
      }/>

      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
</AuthProvider>
```

---

## STEP 10 — `src/pages/Login.jsx`

```
PURPOSE: Login form → stores JWT → redirects to dashboard.

VISUAL:
  Centered card (max-w-sm, mx-auto, mt-24)
  Title: "Sign in to ChatBots"
  Fields: Email, Password
  Button: "Sign in" (full width, blue)
  Link: "Don't have an account? Register"

IMPLEMENT:
- Form state: email, password
- On submit: useApi().call(login, email, password)
  on success: AuthContext.login() is called internally — then navigate("/")
  on error: show ErrorBanner with error message
- If already authenticated (token exists): navigate("/") immediately
- No extra styling — keep it simple
```

---

## STEP 11 — `src/pages/Register.jsx`

```
PURPOSE: Registration form.

VISUAL:
  Same card layout as Login
  Title: "Create your account"
  Fields: Email, Display Name, Password, Confirm Password
  Button: "Create account"
  Link: "Already have an account? Sign in"

IMPLEMENT:
- Validate passwords match client-side before submitting
- On success: navigate("/login") with a success message via URL param
  ?registered=true → Login page shows "Account created. Please sign in."
- On 409 conflict: show "This email is already registered"
```

---

## STEP 12 — `src/pages/Dashboard.jsx`

```
PURPOSE: List all user's bots. Entry point after login.

VISUAL:
┌─────────────────────────────────────────────────┐
│  "Your Bots"              [+ Create New Bot]     │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Bot Card │ │ Bot Card │ │ Bot Card │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                   │
│  (empty state: "No bots yet. Create your first") │
└─────────────────────────────────────────────────┘

BOT CARD (each is a link to /bots/{id}):
  bg-white, rounded-xl, border, p-4, hover:shadow-md transition
  Top: Bot name (font-medium) + type badge
    intent badge:     bg-purple-100 text-purple-700
    rag badge:        bg-blue-100 text-blue-700
    persona_rag badge:bg-green-100 text-green-700
  Bottom: created_at date (text-gray-400, text-sm)

IMPLEMENT:
- Call listBots() on mount
- Show Spinner while loading
- Show ErrorBanner if error
- "+ Create New Bot" button navigates to /bots/new
```

---

## STEP 13 — `src/pages/CreateBot.jsx`

```
PURPOSE: Form to create a new bot.

VISUAL:
  max-w-lg card, centered
  Title: "Configure your new bot"

  Field: Bot Name (text input, required)
  Field: Bot Type (select dropdown)
    options: Intent Bot | RAG Bot | Persona RAG Bot
    values:  intent    | rag     | persona_rag

  Conditional fields (shown only when bot_type == "persona_rag"):
    Field: Persona Name (text input)
    Field: Persona Prompt (textarea, rows=4,
           placeholder: "You are Aria, a friendly support agent for Acme Corp...")

  Field: System Prompt (textarea, rows=3, optional, shown for all types)

  Button: "Create Bot" (blue, full width)
  Link: "← Back to Dashboard"

IMPLEMENT:
- On success: navigate to /bots/{new_bot_id}
  Show the api_key in a dismissible info box on the BotDetail page:
  Store api_key temporarily in sessionStorage key "new_bot_api_key_{bot_id}"
  BotDetail reads and clears it on mount
- On error: show ErrorBanner
```

---

## STEP 14 — `src/pages/BotDetail.jsx`

```
PURPOSE: Bot detail page with tabs. Shell only — tabs are separate components.

VISUAL:
┌─────────────────────────────────────────────────┐
│  Bot Name                    [💬 Open Chat Demo] │
│  Type badge   Created: date                      │
│                                                   │
│  [Overview][Documents][Intents][History]          │
│  [Analytics][Snippet]                             │
│                                                   │
│  ── tab content ──                               │
└─────────────────────────────────────────────────┘

IMPLEMENT:
- On mount: call getBot(botId)
  If 404: show "Bot not found" and link back to dashboard
- Tab state: useState("overview") — URL hash not needed for MVP
- Show new API key banner if sessionStorage has "new_bot_api_key_{botId}":
    bg-amber-50, border-amber-300 text
    "Your API key (shown once only): cbp_xxxx..."
    Copy button + dismiss button
    Clear from sessionStorage on dismiss
- "Open Chat Demo" button links to /bots/{botId}/chat
  Passes api_key via sessionStorage key "chat_api_key_{botId}" if still in session
- Tab visibility rules:
    Documents tab: only for rag and persona_rag bots
    Intents tab:   only for intent bots
```

---

## STEP 15 — `src/pages/BotDetail/tabs/Overview.jsx`

```
PURPOSE: Show bot metadata. Allow name/prompt edits. Allow delete.

VISUAL:
  Section: "Bot Details"
    Fields shown as editable inputs (always in edit mode — no separate edit button)
      Name (text input)
      Persona Name (text input, shown only for persona_rag)
      Persona Prompt (textarea, shown only for persona_rag)
      System Prompt (textarea)
    Button: "Save Changes" → PATCH /platform/bots/{id}

  Section: "Danger Zone" (border-red-200, bg-red-50)
    Text: "Deleting a bot is permanent. All history and analytics will be lost."
    Button: "Delete Bot" (red outline) → opens ConfirmModal
      On confirm: deleteBot(botId) → navigate("/")

IMPLEMENT:
- Pre-populate fields from bot prop passed from BotDetail
- Only PATCH on "Save Changes" click, not on every keystroke
- Show success toast message "Saved!" for 2 seconds after successful PATCH
  (simple useState timeout — no toast library)
```

---

## STEP 16 — `src/pages/BotDetail/tabs/Documents.jsx`

```
PURPOSE: Upload PDF or TXT documents to a RAG bot.

VISUAL:
  Upload area:
    Dashed border box, "Click to select or drag and drop"
    Accepts: .pdf, .txt only
    Max size shown: 20MB
  Field: Description (optional text input)
  Button: "Upload & Index"

  Result section (after upload):
    "✓ Indexed {chunks_indexed} chunks from {filename}"

IMPLEMENT:
- Use <input type="file" accept=".pdf,.txt" />
- Read file, validate size < 20MB client-side before submitting
  Show inline error: "File exceeds 20MB limit" without hitting the server
- On upload: show Spinner + "Indexing document..." text (can take a few seconds)
- On success: show green success message
- On error: show ErrorBanner
- Allow multiple uploads (each replaces or adds to the bot's index — just call the endpoint)
```

---

## STEP 17 — `src/pages/BotDetail/tabs/Intents.jsx`

```
PURPOSE: Define intent labels and train the DistilBERT classifier.

VISUAL:
┌─────────────────────────────────────────────────┐
│  Intent Training                                 │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Label: [________]  Response: [____________] │ │
│  │ Examples:                                   │ │
│  │   [example 1________________] [× remove]    │ │
│  │   [example 2________________] [× remove]    │ │
│  │   [+ Add example]                           │ │
│  │                               [× Remove intent]│ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  [+ Add Intent]                                  │
│                                                   │
│  [Train Model] ← disabled if any intent < 5 examples │
└─────────────────────────────────────────────────┘

IMPLEMENT:
- State: array of { label, response, examples[] }
- Start with 1 empty intent block on mount
- "Add example" appends empty string to examples array
- "Remove" on example removes that index
- "Add Intent" appends new empty intent block
- "Remove Intent" removes that block (min 1 always)
- Validation before submit:
    Every label must be non-empty
    Every intent must have ≥ 5 examples
    Show inline red text "At least 5 examples required" under any intent that fails
    Disable Train button if validation fails
- On submit: show "Training... this takes ~20 seconds" message + Spinner
- On success: show "Model trained! Accuracy: {accuracy}" in green
- On error: show ErrorBanner
```

---

## STEP 18 — `src/pages/BotDetail/tabs/History.jsx`

```
PURPOSE: Browse sessions and view message history.

VISUAL:
┌─────────────────────────────────────────────────┐
│  Chat History                                    │
│                                                   │
│  Sessions                    Messages             │
│  ┌───────────────────┐      ┌──────────────────┐ │
│  │ sess_abc (3 msgs) │ →    │ user: hello      │ │
│  │ last: 2h ago      │      │ bot: Hi there!   │ │
│  │ [Delete]          │      │ user: ...        │ │
│  │                   │      │                  │ │
│  │ sess_xyz (8 msgs) │      │                  │ │
│  └───────────────────┘      └──────────────────┘ │
└─────────────────────────────────────────────────┘

IMPLEMENT:
- On mount: call listSessions(botId)
- Click session: call getSession(botId, sessionId) → show messages on right
- Messages displayed as chat bubbles:
    user role: right-aligned, bg-blue-500 text-white
    assistant role: left-aligned, bg-white border text-gray-800
- Delete session: ConfirmModal → deleteSession() → remove from list
- Empty state: "No chat sessions yet"
- Format timestamps as relative ("2 hours ago") using simple helper function:
    function timeAgo(dateStr) — no external library
```

---

## STEP 19 — `src/pages/BotDetail/tabs/Analytics.jsx`

```
PURPOSE: Show usage stats for the bot.

VISUAL:
  Top row — 4 stat cards:
    Total Queries | Cache Hits | Intent Hits | RAG Hits
    (white card, number large, label below in gray)

  Cache Hit Rate: "{percent}% of queries served from cache"
  (shown as a simple percentage text, no chart library needed)

  Period selector: dropdown [7 days | 30 days | 90 days]
    Default: 30 days

  Table: daily breakdown
    Columns: Date | Queries | Cache | Intent | RAG
    Rows: one per day from the API response
    Sorted newest first
    bg-white, striped rows (even: bg-gray-50)

IMPLEMENT:
- On mount and on period change: call getAnalytics(botId, days)
- Show Spinner while loading
- Empty state: "No activity yet — start chatting with your bot"
- No chart library — table is sufficient for MVP
```

---

## STEP 20 — `src/pages/BotDetail/tabs/Snippet.jsx`

```
PURPOSE: Show copy-paste embed code for the bot.

VISUAL:
  Intro text: "Use these snippets to integrate your bot into any application."

  Input: "Your backend URL" (pre-filled with VITE_API_BASE_URL)
  On change: re-fetch snippet with new base_url

  Three code blocks with copy button on each:
    Tab selector: [JavaScript] [Python] [cURL]
    Code: pre + code block, bg-gray-900 text-green-400, rounded, p-4
    "Copy" button top-right of each block
      On click: copy to clipboard + show "Copied!" for 1.5s

IMPLEMENT:
- Call getSnippet(botId, baseUrl) on mount and when baseUrl changes (debounce 500ms)
- Clipboard via navigator.clipboard.writeText()
- No syntax highlighting library needed — monospace pre block is enough
```

---

## STEP 21 — `src/pages/Chat.jsx`

```
PURPOSE: Demo chat interface — lets the user test their bot directly.
         This is a convenience screen, not the end-user embed.

VISUAL:
┌─────────────────────────────────────────────────┐
│  Chat with: {bot name}                 [← Back]  │
│  Mode: [Standard] [Streaming]                    │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Messages area (scrollable)                  │ │
│  │                                             │ │
│  │     user: hello                             │ │
│  │ bot: Hi! How can I help?       [cache] badge│ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  API Key: [cbp_xxxx...] (editable)               │
│  Session: [sess_xxx  ] (editable)                │
│  [____________________query input__________][Send]│
└─────────────────────────────────────────────────┘

IMPLEMENT:
- On mount: read api_key from sessionStorage "chat_api_key_{botId}" if present
  If not: show input field to manually enter API key
- session_id: default to "demo_" + random 6 chars, user can change it
- Mode toggle: Standard vs Streaming
  Standard: call sendChat() → append full response
  Streaming: call streamChat() → append tokens one by one (typewriter effect)
- Source badge on each assistant message:
    "cache"  → bg-yellow-100 text-yellow-700
    "intent" → bg-purple-100 text-purple-700
    "rag"    → bg-blue-100 text-blue-700
- Auto-scroll to bottom on new message
- Enter key submits (unless Shift+Enter)
- Loading: show "..." bubble while waiting for response
- Error: show inline error below the input
```

---

## STEP 22 — `src/pages/Login.jsx` additions

```
Handle ?registered=true URL param:
  Show info banner: "Account created successfully. Please sign in."
  (blue banner at top, auto-dismiss after 4 seconds)
```

---

## STEP 23 — `src/pages/NotFound.jsx`

```
Simple centered message:
  "404 — Page not found"
  Link back to Dashboard
```

---

## API COMPATIBILITY MAP

```
Every endpoint in this table is verified working on the backend.
Frontend must call exactly these — no assumptions.

ENDPOINT                                    METHOD  AUTH            CALLED IN
/auth/register                              POST    none            Register.jsx
/auth/login                                 POST    none            Login.jsx
/auth/me                                    GET     Bearer JWT      AuthContext (on mount)
/platform/bots                              GET     Bearer JWT      Dashboard.jsx
/platform/bots                              POST    Bearer JWT      CreateBot.jsx
/platform/bots/{id}                         GET     Bearer JWT      BotDetail.jsx
/platform/bots/{id}                         PATCH   Bearer JWT      Overview.jsx
/platform/bots/{id}                         DELETE  Bearer JWT      Overview.jsx
/platform/bots/{id}/documents               POST    Bearer JWT      Documents.jsx
/platform/bots/{id}/intents                 POST    Bearer JWT      Intents.jsx
/platform/bots/{id}/sessions                GET     Bearer JWT      History.jsx
/platform/bots/{id}/sessions/{session_id}   GET     Bearer JWT      History.jsx
/platform/bots/{id}/sessions/{session_id}   DELETE  Bearer JWT      History.jsx
/platform/bots/{id}/analytics               GET     Bearer JWT      Analytics.jsx
/platform/bots/{id}/snippet                 GET     Bearer JWT      Snippet.jsx
/v1/chat/{id}                               POST    X-API-Key       Chat.jsx
/v1/chat/{id}/stream                        POST    X-API-Key       Chat.jsx (stream mode)
```

---

## RESPONSE SHAPES THE FRONTEND MUST HANDLE

```js
// POST /auth/login → TokenResponse
{ access_token: string, token_type: "bearer", user_id: string, email: string }

// GET /auth/me → UserResponse
{ id: string, email: string, display_name: string, created_at: string }

// GET /platform/bots → BotListResponse
{ bots: BotResponse[], total: number }

// POST /platform/bots → CreateBotResponse
{ id, name, bot_type, is_active, created_at, api_key }
// api_key shown once — store in sessionStorage immediately

// POST /platform/bots/{id}/intents → training result
{ status: "trained", labels: string[], accuracy: number }

// GET /platform/bots/{id}/sessions → SessionSummary[]
[{ session_id: string, message_count: number, last_active: string }]

// GET /platform/bots/{id}/sessions/{session_id} → ChatHistoryResponse
{ bot_id, session_id, messages: MessageRecord[], total }
// MessageRecord: { id, role: "user"|"assistant", content, source_type, created_at }

// GET /platform/bots/{id}/analytics → AnalyticsResponse
{
  bot_id, period_days,
  totals: { total_queries, total_cache_hits, cache_hit_rate, total_intent_hits, total_rag_hits },
  daily: [{ date, query_count, cache_hits, intent_hits, rag_hits }]
}

// GET /platform/bots/{id}/snippet → SnippetResponse
{ bot_id, javascript: string, python_code: string, curl: string }

// POST /v1/chat/{id} → QueryResponse
{ answer: string, bot_id, session_id, source_type: "intent"|"rag"|"cache" }

// Error shape (all endpoints)
{ detail: string }
// or for 422:
{ detail: "Validation failed", errors: [...] }
```

---

## ERROR HANDLING RULES

```
401 → clear token, navigate to /login
403 → show ErrorBanner "You don't have permission"
404 → show ErrorBanner "Not found"
409 → show ErrorBanner with detail message (e.g. "Email already registered")
413 → show ErrorBanner "File too large (max 20MB)"
415 → show ErrorBanner "Unsupported file type"
422 → show ErrorBanner with first error from errors array
429 → show ErrorBanner "Too many requests — slow down"
500 → show ErrorBanner "Server error — try again"
network error → show ErrorBanner "Cannot reach the server"
```

---

## VISUAL STYLE GUIDE

```
Font:         system-ui (no Google Fonts import needed)
Colors:
  Primary:    blue-600 / blue-700
  Danger:     red-600 / red-700
  Success:    green-600
  Warning:    amber-500
  Background: gray-50 (page) / white (cards)
  Text:       gray-900 (primary) / gray-500 (secondary)
  Border:     gray-200

Buttons:
  Primary:  bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700
  Danger:   bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700
  Ghost:    text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100
  Disabled: opacity-50 cursor-not-allowed

Inputs:
  border border-gray-300 rounded-lg px-3 py-2 w-full
  focus:outline-none focus:ring-2 focus:ring-blue-500

Cards:
  bg-white rounded-xl border border-gray-200 p-4 or p-6

Labels:
  text-sm font-medium text-gray-700 mb-1 block

Spacing:  use gap-4, gap-6, space-y-4 — be consistent
```

---

## BOOT SEQUENCE

```bash
# Backend must be running first
uvicorn main:app --port 8001 --reload

# Then start frontend
cd chatbot-platform-frontend
npm run dev
# Runs on http://localhost:5173

# First time flow:
# 1. Open http://localhost:5173/register
# 2. Create account
# 3. Login → redirect to Dashboard
# 4. Create a bot → copy API key from banner
# 5. Upload document (RAG) or train intents
# 6. Open Chat Demo → test the bot
```

---

## FILES TO CREATE (in order)

```
1.  .env
2.  vite.config.js
3.  tailwind.config.js
4.  postcss.config.js
5.  src/main.jsx
6.  src/api/client.js             ← build this first, everything depends on it
7.  src/context/AuthContext.jsx
8.  src/hooks/useAuth.js
9.  src/hooks/useApi.js
10. src/components/Spinner.jsx
11. src/components/ErrorBanner.jsx
12. src/components/ConfirmModal.jsx
13. src/components/ProtectedRoute.jsx
14. src/components/Layout.jsx
15. src/App.jsx
16. src/pages/NotFound.jsx
17. src/pages/Login.jsx
18. src/pages/Register.jsx
19. src/pages/Dashboard.jsx
20. src/pages/CreateBot.jsx
21. src/pages/BotDetail.jsx
22. src/pages/BotDetail/tabs/Overview.jsx
23. src/pages/BotDetail/tabs/Documents.jsx
24. src/pages/BotDetail/tabs/Intents.jsx
25. src/pages/BotDetail/tabs/History.jsx
26. src/pages/BotDetail/tabs/Analytics.jsx
27. src/pages/BotDetail/tabs/Snippet.jsx
28. src/pages/Chat.jsx
```