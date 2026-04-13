"""
Document processor — loads PDF or TXT files, splits into chunks, and indexes into
the bot's FAISS vector store. Fully standalone, no Adaptive-Rag imports.
"""

import os
import tempfile
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from core.logger import logger
from vector.faiss_store import add_documents

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from db.postgres import BotDocument

SUPPORTED_TYPES: set[str] = {".pdf", ".txt"}


async def process_and_index(
    bot_id: str,
    file_bytes: bytes,
    filename: str,
    description: str = "",
    db: AsyncSession = None,
) -> int:
    """
    Load a PDF or TXT file, split into chunks, and store in the bot's FAISS index.

    Args:
        bot_id:      The bot's UUID string — determines which FAISS namespace to use.
        file_bytes:  Raw file content (from UploadFile.read()).
        filename:    Original filename including extension.
        description: Optional description stored as chunk metadata.

    Returns:
        Number of chunks indexed.

    Raises:
        ValueError: If the file type is not supported.
    """
    if not file_bytes.strip():
        raise ValueError("Cannot process an empty file.")

    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_TYPES:
        raise ValueError(
            f"Unsupported file type: '{suffix}'. Supported types: {SUPPORTED_TYPES}"
        )

    # Write bytes to a temp file so loaders can read from disk
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if suffix == ".pdf":
            loader = PyPDFLoader(tmp_path)
        else:
            loader = TextLoader(tmp_path, encoding="utf-8")

        docs = loader.load()

        # Attach metadata to every document page
        for doc in docs:
            doc.metadata["source"] = filename
            doc.metadata["bot_id"] = bot_id
            if description:
                doc.metadata["description"] = description

        # Split into overlapping chunks
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = splitter.split_documents(docs)

        count = await add_documents(bot_id, chunks)
        if db:
            db.add(BotDocument(
                bot_id=uuid.UUID(bot_id),
                filename=filename,
                file_size_kb=len(file_bytes) // 1024,
                chunk_count=count,
                description=description or None,
            ))
            await db.commit()
        logger.info(f"Indexed {count} chunks for bot {bot_id} from '{filename}'")
        return count

    finally:
        os.unlink(tmp_path)
