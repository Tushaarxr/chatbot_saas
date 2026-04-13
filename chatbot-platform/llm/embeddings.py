"""
Local BGE-small embeddings — replaces OpenAI embeddings.
Model is cached at module level so it only loads once (~3 s warm-up).
"""

from langchain_huggingface import HuggingFaceEmbeddings

from core.logger import logger

_embeddings_instance: HuggingFaceEmbeddings | None = None


def get_embeddings() -> HuggingFaceEmbeddings:
    """
    Return a cached HuggingFaceEmbeddings instance using BGE-small-en-v1.5.

    The model is downloaded automatically on first call (~133 MB).
    Subsequent calls return the already-loaded instance instantly.
    """
    global _embeddings_instance
    if _embeddings_instance is not None:
        return _embeddings_instance

    logger.info("Loading BGE-small-en-v1.5 embeddings model (first time may take ~30 s)...")
    _embeddings_instance = HuggingFaceEmbeddings(
        model_name="BAAI/bge-small-en-v1.5",
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
    logger.info("Embeddings model loaded successfully.")
    return _embeddings_instance
