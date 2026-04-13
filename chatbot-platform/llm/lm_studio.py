"""
LM Studio LangChain client — points at the local LM Studio server (OpenAI-compat API).
Falls back to OpenAI gpt-4o if LM Studio is unreachable and LLM_PROVIDER=openai.

Singleton pattern: get_llm() loads once and caches.
Call reset_llm() after swapping models in LM Studio to force reload.
"""

import httpx
from langchain_openai import ChatOpenAI

from core.config import settings
from core.logger import logger

_instance: ChatOpenAI | None = None


def get_llm() -> ChatOpenAI:
    """Return a cached LangChain LLM client (LM Studio or OpenAI fallback)."""
    global _instance
    if _instance is not None:
        return _instance

    if settings.llm_provider == "local":
        try:
            resp = httpx.get(f"{settings.lm_studio_url}/models", timeout=3.0)
            resp.raise_for_status()
            model_id = resp.json()["data"][0]["id"]
            logger.info(f"LM Studio connected — model: {model_id}")
            _instance = ChatOpenAI(
                base_url=settings.lm_studio_url,
                api_key="lm-studio",        # LM Studio ignores this value
                model=model_id,
                temperature=0.1,
                max_tokens=1024,
                timeout=60,
            )
        except Exception as exc:
            logger.warning(
                f"LM Studio unreachable ({exc}) — falling back to OpenAI gpt-4o"
            )
            _instance = ChatOpenAI(
                model="gpt-4o",
                api_key=settings.openai_api_key,
            )
    else:
        logger.info("LLM provider = openai — using gpt-4o")
        _instance = ChatOpenAI(
            model="gpt-4o",
            api_key=settings.openai_api_key,
        )

    return _instance


def reset_llm() -> None:
    """Force reload of LLM client — call after changing the model in LM Studio."""
    global _instance
    _instance = None
    logger.info("LLM instance cache cleared — next call to get_llm() will reconnect")
