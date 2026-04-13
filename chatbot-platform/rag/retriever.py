"""
Retriever tool wrapper — wraps the per-bot FAISS retriever as a LangChain Tool
so it can be used inside the RAG graph or a ReAct agent.
"""

from langchain.tools.retriever import create_retriever_tool
from langchain_core.tools import Tool

from vector.faiss_store import get_retriever


def get_retriever_tool(bot_id: str) -> Tool:
    """
    Return a LangChain Tool that searches the bot's FAISS document index.

    Args:
        bot_id: The bot's UUID string — determines which FAISS index to load.

    Returns:
        A LangChain Tool named 'document_search'.
    """
    retriever = get_retriever(bot_id)
    return create_retriever_tool(
        retriever,
        name="document_search",
        description=(
            "Search uploaded documents for relevant information. "
            "Use for questions about specific uploaded content such as manuals, "
            "policies, reports, or any file the user has provided."
        ),
    )
