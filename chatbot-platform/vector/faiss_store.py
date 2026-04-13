"""
Per-bot namespaced FAISS vector store manager.

Each bot gets its own sub-directory under VECTOR_STORE_DIR:
    data/vector_stores/<bot_id>/

Stores are lazily loaded from disk and cached in memory.
"""

from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.vectorstores import VectorStoreRetriever

from core.config import settings
from core.logger import logger
from llm.embeddings import get_embeddings

# In-memory cache: bot_id → FAISS instance
_stores: dict[str, FAISS] = {}


def get_store_path(bot_id: str) -> Path:
    """Return the filesystem path for a bot's FAISS index directory."""
    return Path(settings.vector_store_dir) / bot_id


async def add_documents(bot_id: str, chunks: list[Document]) -> int:
    """
    Add document chunks to a bot's FAISS store (creates it if it doesn't exist).

    Args:
        bot_id: The bot's UUID string.
        chunks: LangChain Document objects to index.

    Returns:
        Number of chunks indexed.
    """
    embeddings = get_embeddings()
    path = get_store_path(bot_id)
    path.mkdir(parents=True, exist_ok=True)

    if bot_id in _stores:
        # Append to existing in-memory store
        _stores[bot_id].add_documents(chunks)
        logger.info(f"Added {len(chunks)} chunks to existing store for bot {bot_id}")
    else:
        # Build a new store from scratch
        _stores[bot_id] = FAISS.from_documents(chunks, embeddings)
        logger.info(f"Created new FAISS store for bot {bot_id} with {len(chunks)} chunks")

    # Persist to disk so it survives restarts
    _stores[bot_id].save_local(str(path))
    return len(chunks)


def get_retriever(bot_id: str) -> VectorStoreRetriever:
    """
    Return a retriever for a bot's FAISS store.

    Loads from disk if not already in the in-memory cache.

    Args:
        bot_id: The bot's UUID string.

    Raises:
        ValueError: If no documents have been uploaded for this bot yet.
    """
    if bot_id not in _stores:
        path = get_store_path(bot_id)
        if not path.exists():
            raise ValueError(
                f"No documents found for bot '{bot_id}'. "
                "Upload documents first via POST /platform/bots/{bot_id}/documents"
            )
        logger.info(f"Loading FAISS store from disk for bot {bot_id}")
        _stores[bot_id] = FAISS.load_local(
            str(path),
            get_embeddings(),
            allow_dangerous_deserialization=True,   # required by LangChain for pickle-based FAISS
        )

    return _stores[bot_id].as_retriever(search_kwargs={"k": 4})


def bot_has_documents(bot_id: str) -> bool:
    """Return True if a FAISS index exists on disk for the given bot."""
    return get_store_path(bot_id).exists()
