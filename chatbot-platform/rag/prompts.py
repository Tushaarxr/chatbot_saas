"""
All prompt templates for the standalone RAG pipeline.
Inspired by Adaptive-Rag concepts but fully self-contained — no external imports.
"""

# ---------------------------------------------------------------------------
# STEP 1: Route the user query to the right pipeline node
# ---------------------------------------------------------------------------

CLASSIFY_PROMPT: str = """You are a query routing assistant. Given the user's question, classify it into exactly one route.

Routes:
- "index"   → The question is about specific content that may be in uploaded documents (product docs, manuals, reports, etc.)
- "general" → A factual or conversational question answerable from general knowledge (no documents needed)
- "search"  → The question requires up-to-date or real-time information (news, prices, current events, live data)

Few-shot examples:
Question: "What is the refund policy in our terms of service?" → {{"route": "index"}}
Question: "Who invented the telephone?" → {{"route": "general"}}
Question: "What is the stock price of Apple today?" → {{"route": "search"}}
Question: "Summarize the uploaded policy document." → {{"route": "index"}}
Question: "Explain the concept of recursion." → {{"route": "general"}}
Question: "What happened in the news today?" → {{"route": "search"}}

User question: {query}

Respond with ONLY valid JSON — no explanation, no markdown:
{{"route": "index" | "general" | "search"}}"""


# ---------------------------------------------------------------------------
# STEP 2: Grade whether retrieved context is relevant to the query
# ---------------------------------------------------------------------------

GRADE_PROMPT: str = """You are a relevance grader. Determine if the retrieved document context is useful for answering the user's question.

User question: {query}

Retrieved context:
{context}

Is the context relevant and sufficient to answer the question?
Respond with ONLY valid JSON:
{{"binary_score": "yes"}} if the context is relevant and helpful
{{"binary_score": "no"}} if the context is irrelevant, empty, or insufficient"""


# ---------------------------------------------------------------------------
# STEP 3: Rewrite query for better vector search
# ---------------------------------------------------------------------------

REWRITE_PROMPT: str = """You are a query rewriter for vector similarity search.
Rewrite the following question to be more specific, descriptive, and optimized for semantic search against a document index.
Remove vague terms, expand abbreviations, and make the intent crystal-clear.

Original question: {query}

Respond with ONLY the rewritten question string — no explanation, no quotes, no JSON."""


# ---------------------------------------------------------------------------
# STEP 4: Generate a grounded answer from context
# ---------------------------------------------------------------------------

GENERATE_PROMPT: str = """You are a helpful assistant. Answer the user's question using ONLY the provided context.
Do not use any external knowledge. If the context does not contain enough information to answer, say so honestly.

Context:
{context}

Question: {query}

Answer:"""


# ---------------------------------------------------------------------------
# Persona prefix — injected as system-level instruction for persona_rag bots
# ---------------------------------------------------------------------------

PERSONA_PREFIX: str = "You are {persona_name}. {persona_prompt}\nAlways respond in character.\n\n"
