"""
Core configuration — single source of truth for all environment variables.
Reads from .env in the project root.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All platform settings pulled from environment variables."""

    # --- LLM provider -------------------------------------------------------
    lm_studio_url: str = "http://localhost:1234/v1"
    lm_studio_model: str = "qwen2.5-3b-instruct"   # paste exact ID from /v1/models
    llm_provider: str = "local"                      # "local" = LM Studio | "openai" = fallback

    # --- OpenAI (fallback only) ---------------------------------------------
    openai_api_key: str = ""

    # --- PostgreSQL ---------------------------------------------------------
    postgres_url: str = "postgresql+asyncpg://chatbot:chatbot123@localhost:5432/chatbot_platform"

    # --- Redis --------------------------------------------------------------
    redis_url: str = "redis://localhost:6379"

    # --- Tavily (optional — web search node in RAG) -------------------------
    tavily_api_key: str = ""

    # --- Storage paths (relative to project root) ---------------------------
    vector_store_dir: str = "./data/vector_stores"
    intent_model_dir: str = "./data/intent_models"

    # --- JWT (dev_guides.md §5E) ----------------------------------------------
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days

    # --- API Key Encryption ---------------------------------------------------
    api_key_encryption_secret: str = ""

    # --- Upload limits --------------------------------------------------------
    max_file_size_mb: int = 20

    model_config = SettingsConfigDict(
        env_file=".env",    # standalone project root .env
        extra="ignore",     # silently ignore unknown vars
    )


# Single shared instance — import this everywhere
settings = Settings()
