# Chatbot Platform Frontend - Technical Documentation

## 1. Overview
The Chatbot Platform Frontend is a modern, high-performance web application designed for managing multi-tenant AI agents. It provides a comprehensive interface for bot creation, document indexing, intent training, analytics tracking, and developer-centric integration testing.

- **Stack**: React (Vite), Tailwind CSS v4, React Router 6.
- **Design Philosophy**: Minimalist, high-premium aesthetics with micro-animations and robust validation.
- **Backend Link**: Communicates with a Python/FastAPI backend via the `VITE_API_BASE_URL` environment variable.

---

## 2. Core Architecture

### 2.1 State Management & Auth Context
- **`AuthContext.jsx`**: Centralized provider managing the JWT lifecycle.
    - Stores `cbp_token` in `localStorage`.
    - Handles automatic user fetching (`getMe`) on initialization.
    - Listens for `auth:expired` custom events to force logouts on session expiry.
- **`useApi.js` Hook**: A standardized wrapper for all API operations.
    - Manages `loading` and `error` states locally for every component.
    - This ensures consistent UI feedback (Spinners/ErrorBanners) across the app.

### 2.2 API Client Layer (`api/client.js`)
All backend communication is abstracted into a single client.
- **Authentication**: Automatically attaches `Authorization: Bearer <token>` unless `noAuth: true` is specified.
- **Streaming Support**: Includes `streamChat` using the `fetch` ReadableStream API to handle Server-Sent Events (SSE) for real-time LLM responses.
- **Multipart Data**: Handles manual `FormData` construction for document uploads (`PDF`/`TXT`).

---

## 3. Feature Breakdown

### 3.1 Authentication & Security (`/login`, `/register`)
- **JWT-based session**: Tokens are securely handled in the API layer.
- **Protected Routes**: Custom `ProtectedRoute.jsx` component guards all dashboard routes, redirecting unauthenticated users to `/login`.
- **Validation**: Frontend enforcement for password complexity and matching.

### 3.2 Bot Management Dashboard (`/`)
- A grid-based overview of all user-owned bots.
- Displays bot types (RAG, Intent, Persona) using visual badges.
- Features high-impact "Empty State" UI to guide new users to bot creation.

### 3.3 Bot Creation & Configuration (`/bots/new`, `/bots/:id`)
- **Conditional Forms**: Form fields dynamically change based on `bot_type` (e.g., Persona fields only appear for `persona_rag`).
- **One-time API Keys**: Displays a raw API key only once upon bot creation using `sessionStorage` for temporary persistence during the first view.

### 3.4 Feature Tabs (The Management Suite)
- **Overview**: Metadata management and "Danger Zone" soft-deletion.
- **Documents**: Drag-and-drop style document upload. Validates file size (20MB) and type (`.pdf`, `.txt`) before hitting the backend.
- **Intent Training**: 
    - Advanced multi-level form state.
    - **Logic**: Enforces a minimum of 2 intents and 5 examples each.
    - **Onboarding**: Integrated "Bucket" analogy helper for non-technical users.
- **History**: Split-pane session browser. Displays message-level source attribution (RAG vs Intent).
- **Analytics**: 
    - Interactive date range selection (7, 30, 90 days).
    - Custom SVG-based Donut chart for Cache Hit Rate.
- **Integration/Snippet**: Dynamic code generator for JavaScript, Python, and cURL. Includes a debounced URL proxy editor.

### 3.5 Chat Sandbox (`/bots/:id/chat`)
- **Dual-Mode Testing**: Toggle between Standard (JSON) and Streaming (SSE).
- **Context Awareness**: Shows if an answer came from the vector store (RAG), the intent classifier, or the cache.
- **Session ID Management**: Allows testing multi-turn conversations with custom IDs.

---

## 4. Styling & UI/UX Strategy

### 4.1 Tailwind v4 Performance
- Utilizes the "CSS-first" configuration of Tailwind v4 for faster compilation and leaner bundles.
- Uses `tailwindcss/vite` plugin for optimized delivery.

### 4.2 UX Enhancements
- **Micro-animations**: Used `framer-motion` style transitions via Tailwind's `animate-in` utilities.
- **Consistency**: Centralized `Layout.jsx` ensures the sidebar navigation and app-shell stay consistent regardless of the page depth.
- **Responsiveness**: Fully responsive sidebar that adapts to different viewport widths.

---

## 5. Potential Improvements
- **Optimistic UI**: Implement React Query or SWR for better caching and optimistic updates on intent/document uploads.
- **Real-time Analytics**: Integrate WebSockets for real-time usage monitoring in the analytics dashboard.
- **Fine-grained Roles**: Expand the Auth layer to support multiple user roles (Admin vs. Developer).
- **Unit Testing**: Add Vitest/Testing Library coverage for the core API client and validation utilities.

---

## 6. Directory Structure Summary
```text
src/
├── api/            # client.js - Central API logic
├── components/     # Shared UI (Spinners, Modals, Banners)
├── context/        # AuthProvider & Global state
├── hooks/          # useApi, useAuth
├── pages/          # Full page components
│   └── BotDetail/  # Sub-tab components
└── main.jsx        # Entry point
```
