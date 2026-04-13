"""
Standalone RAG LangGraph pipeline.

Nodes:
  classify_node    → route query to index / general / search
  retrieve_node    → FAISS similarity search
  grade_node       → relevance grading of retrieved context
  rewrite_node     → query rewrite for better retrieval (retry loop, max 2x)
  general_node     → direct LLM answer from world knowledge
  web_search_node  → Tavily web search + generate
  generate_node    → grounded answer from context

No imports from Adaptive-Rag — fully self-contained.
"""

import asyncio
import json
from typing import Annotated, TypedDict

from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel

from core.logger import logger
from llm.lm_studio import get_llm
from rag.prompts import (
    CLASSIFY_PROMPT,
    GENERATE_PROMPT,
    GRADE_PROMPT,
    REWRITE_PROMPT,
)
from vector.faiss_store import get_retriever


# ---------------------------------------------------------------------------
# State definition
# ---------------------------------------------------------------------------

class RagState(TypedDict):
    """Shared state passed between all graph nodes."""
    messages: Annotated[list, add_messages]
    route: str
    binary_score: str
    context: str
    bot_id: str
    persona_prefix: str
    rewrite_count: int          # tracks how many rewrites have happened (max 2)


# ---------------------------------------------------------------------------
# Pydantic models for structured LLM output
# ---------------------------------------------------------------------------

class RouteModel(BaseModel):
    """LLM structured output for the classify node."""
    route: str


class GradeModel(BaseModel):
    """LLM structured output for the grade node."""
    binary_score: str


# ---------------------------------------------------------------------------
# Helper: extract the latest human message text from state
# ---------------------------------------------------------------------------

def _latest_query(state: RagState) -> str:
    """Return the text of the most recent HumanMessage in the conversation."""
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            return msg.content
    return ""


# ---------------------------------------------------------------------------
# Node implementations
# ---------------------------------------------------------------------------

def classify_node(state: RagState) -> dict:
    """Route the query to index, general, or search node."""
    query = _latest_query(state)
    llm = get_llm()
    prompt = CLASSIFY_PROMPT.format(query=query)
    try:
        structured = llm.with_structured_output(RouteModel)
        result: RouteModel = structured.invoke(prompt)
        route = result.route
    except Exception:
        # Fallback: parse raw JSON from LLM response
        try:
            raw = llm.invoke(prompt).content
            route = json.loads(raw).get("route", "general")
        except Exception:
            route = "general"

    logger.info(f"[classify] bot={state['bot_id']} route={route}")
    return {"route": route}


def retrieve_node(state: RagState) -> dict:
    """Retrieve relevant chunks from the bot's FAISS index."""
    query = _latest_query(state)
    bot_id = state["bot_id"]
    try:
        retriever = get_retriever(bot_id)
        docs = retriever.invoke(query)
        context = "\n\n".join(d.page_content for d in docs)
    except ValueError as exc:
        logger.warning(f"[retrieve] {exc}")
        context = ""
    logger.info(f"[retrieve] bot={bot_id} chunks={context.count(chr(10))+1 if context else 0}")
    return {"context": context}


def grade_node(state: RagState) -> dict:
    """Grade whether the retrieved context is relevant to the query."""
    query = _latest_query(state)
    context = state.get("context", "")
    llm = get_llm()
    prompt = GRADE_PROMPT.format(query=query, context=context or "(no context retrieved)")
    try:
        structured = llm.with_structured_output(GradeModel)
        result: GradeModel = structured.invoke(prompt)
        score = result.binary_score
    except Exception:
        try:
            raw = llm.invoke(prompt).content
            score = json.loads(raw).get("binary_score", "no")
        except Exception:
            score = "yes" if context else "no"

    logger.info(f"[grade] bot={state['bot_id']} score={score}")
    return {"binary_score": score}


def rewrite_node(state: RagState) -> dict:
    """Rewrite the query for better vector retrieval (max 2 retries)."""
    query = _latest_query(state)
    llm = get_llm()
    prompt = REWRITE_PROMPT.format(query=query)
    try:
        rewritten = llm.invoke(prompt).content.strip()
    except Exception:
        rewritten = query

    rewrite_count = state.get("rewrite_count", 0) + 1
    logger.info(f"[rewrite] bot={state['bot_id']} attempt={rewrite_count} new_query='{rewritten}'")

    # Replace the last HumanMessage with the rewritten query
    messages = list(state["messages"])
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            messages[i] = HumanMessage(content=rewritten)
            break

    return {
        "messages": messages,
        "route": "index",       # force re-retrieval
        "binary_score": "",
        "context": "",
        "rewrite_count": rewrite_count,
    }


def general_node(state: RagState) -> dict:
    """Answer directly from world knowledge — no retrieval needed."""
    llm = get_llm()
    messages = list(state["messages"])
    try:
        response = llm.invoke(messages)
        answer = response.content
    except Exception as exc:
        answer = f"I encountered an error generating a response: {exc}"
    logger.info(f"[general] bot={state['bot_id']}")
    return {"messages": [AIMessage(content=answer)]}


def web_search_node(state: RagState) -> dict:
    """Perform a Tavily web search and store results as context."""
    query = _latest_query(state)
    try:
        tool = TavilySearchResults(max_results=3)
        results = tool.invoke(query)
        context = "\n\n".join(
            r.get("content", "") for r in results if isinstance(r, dict)
        ) if isinstance(results, list) else str(results)
    except Exception as exc:
        logger.warning(f"[web_search] Tavily failed: {exc}")
        context = ""
    logger.info(f"[web_search] bot={state['bot_id']} context_len={len(context)}")
    return {"context": context}


def generate_node(state: RagState) -> dict:
    """Generate a grounded answer from retrieved or web-searched context."""
    query = _latest_query(state)
    context = state.get("context", "")
    persona_prefix = state.get("persona_prefix", "")

    llm = get_llm()
    prompt = persona_prefix + GENERATE_PROMPT.format(context=context, query=query)
    try:
        response = llm.invoke(prompt)
        answer = response.content
    except Exception as exc:
        answer = f"I encountered an error generating a response: {exc}"
    logger.info(f"[generate] bot={state['bot_id']}")
    return {"messages": [AIMessage(content=answer)]}


# ---------------------------------------------------------------------------
# Conditional edge functions
# ---------------------------------------------------------------------------

def _route_after_classify(state: RagState) -> str:
    """Direct traffic after classify_node."""
    return state.get("route", "general")


def _route_after_grade(state: RagState) -> str:
    """After grading: if relevant → generate; if not → rewrite (max 2 times)."""
    if state.get("binary_score") == "yes":
        return "generate"
    if state.get("rewrite_count", 0) >= 2:
        logger.warning(f"[grade] bot={state['bot_id']} max rewrites reached — generating anyway")
        return "generate"
    return "rewrite"


# ---------------------------------------------------------------------------
# Build and compile the graph
# ---------------------------------------------------------------------------

def _build_graph() -> StateGraph:
    """Construct and return the compiled LangGraph."""
    builder = StateGraph(RagState)

    # Register nodes
    builder.add_node("classify", classify_node)
    builder.add_node("retrieve", retrieve_node)
    builder.add_node("grade", grade_node)
    builder.add_node("rewrite", rewrite_node)
    builder.add_node("general", general_node)
    builder.add_node("web_search", web_search_node)
    builder.add_node("generate", generate_node)

    # Entry
    builder.add_edge(START, "classify")

    # Classify → branch
    builder.add_conditional_edges(
        "classify",
        _route_after_classify,
        {"index": "retrieve", "general": "general", "search": "web_search"},
    )

    # Retrieve → grade
    builder.add_edge("retrieve", "grade")

    # Grade → generate or rewrite
    builder.add_conditional_edges(
        "grade",
        _route_after_grade,
        {"generate": "generate", "rewrite": "rewrite"},
    )

    # Rewrite → retrieve (retry loop)
    builder.add_edge("rewrite", "retrieve")

    # Terminals
    builder.add_edge("web_search", "generate")
    builder.add_edge("generate", END)
    builder.add_edge("general", END)

    return builder.compile()


# Compiled graph — module-level singleton
graph = _build_graph()

# Semaphore: LM Studio handles one generation at a time
_sem = asyncio.Semaphore(1)


async def run_graph(state: dict) -> dict:
    """
    Invoke the RAG graph asynchronously.

    Wraps the synchronous graph.invoke() call in a thread so it doesn't block
    the FastAPI event loop. The semaphore ensures only one LM Studio call at a time.
    """
    async with _sem:
        return await asyncio.to_thread(graph.invoke, state)
