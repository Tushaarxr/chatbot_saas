"""
Root API router — mounts all sub-routers into a single APIRouter.
Imported in main.py and attached to the FastAPI app.

Per dev_guides.md §FINAL (router.py).
"""

from fastapi import APIRouter

from api.auth import router as auth_router
from api.bots import router as bots_router
from api.query import router as query_router

api_router = APIRouter()

# /auth/...        — register, login, /me
api_router.include_router(auth_router)

# /platform/bots/... — bot management (prefixed inside bots.py)
api_router.include_router(bots_router)

# /v1/chat/...       — public chat endpoints (prefixed inside query.py)
api_router.include_router(query_router)
