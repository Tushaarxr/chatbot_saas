"""
Comprehensive verification suite for Chatbot Platform Backend.
Tests Auth, Bot Lifecycle, Chat, History, and Analytics.

Run: python test_platform_full.py
"""

import asyncio
import httpx
import uuid
import sys
from datetime import datetime

BASE_URL = "http://127.0.0.1:8001"
TEST_USER = {
    "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
    "display_name": "Test User",
    "password": "securepassword123"
}

async def run_tests():
    print("Starting Full Backend Verification Pipeline\n")
    
    timeout = httpx.Timeout(None)
    async with httpx.AsyncClient(timeout=timeout) as client:
        # -------------------------------------------------------------------
        # 1. AUTHENTICATION
        # -------------------------------------------------------------------
        print("--- Phase 1: Authentication ---")
        
        # Register
        reg_resp = await client.post(f"{BASE_URL}/auth/register", json=TEST_USER)
        if reg_resp.status_code == 409:
            print("[INFO] User already exists (Conflict expected if re-running)")
        else:
            assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.text}"
            print("[OK] User Registered")

        # Login
        login_resp = await client.post(f"{BASE_URL}/auth/login", json={
            "email": TEST_USER["email"],
            "password": TEST_USER["password"]
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token_data = login_resp.json()
        token = token_data["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}
        print("[OK] Login successful (JWT acquired)")

        # Verify Me
        me_resp = await client.get(f"{BASE_URL}/auth/me", headers=auth_headers)
        assert me_resp.status_code == 200, f"Auth Me failed: {me_resp.text}"
        print(f"[OK] Auth Me verified for: {me_resp.json()['display_name']}")
        print("")


        # -------------------------------------------------------------------
        # 2. BOT MANAGEMENT (CRUD)
        # -------------------------------------------------------------------
        print("--- Phase 2: Bot Management ---")
        
        # Create Bot
        bot_payload = {
            "name": "Verification Bot",
            "bot_type": "intent",
            "system_prompt": "You are a verification assistant."
        }
        create_resp = await client.post(f"{BASE_URL}/platform/bots", json=bot_payload, headers=auth_headers)
        assert create_resp.status_code == 201, f"Bot creation failed: {create_resp.text}"
        bot_data = create_resp.json()
        bot_id = bot_data["id"]
        api_key = bot_data["api_key"]
        print(f"[OK] Bot Created: {bot_id}")

        # List Bots
        list_resp = await client.get(f"{BASE_URL}/platform/bots", headers=auth_headers)
        assert list_resp.status_code == 200
        assert len(list_resp.json()["bots"]) > 0
        print(f"[OK] Bot List confirmed (Count: {list_resp.json()['total']})")

        # Update Bot
        patch_payload = {"name": "Updated Verifier", "persona_name": "Senior Bot"}
        patch_resp = await client.patch(f"{BASE_URL}/platform/bots/{bot_id}", json=patch_payload, headers=auth_headers)
        assert patch_resp.status_code == 200
        assert patch_resp.json()["name"] == "Updated Verifier"
        print("[OK] Bot PATCH verified")
        print("")


        # -------------------------------------------------------------------
        # 3. CONVERSATIONAL DATA PIPELINE (INTENT)
        # -------------------------------------------------------------------
        print("--- Phase 3: Intent Pipeline & History ---")
        
        # Train Intents
        intents_data = {
            "intents": [
                {
                    "label": "status",
                    "response": "The system is optimal.",
                    "examples": ["how is the system", "what is the status", "is it working", "check health", "system status"]
                },
                {
                    "label": "bye",
                    "response": "Goodbye user!",
                    "examples": ["bye bye", "farewell", "exit", "quit session", "done talking"]
                }
            ]
        }
        print("Training DistilBERT (expect ~20s delay)...")
        train_resp = await client.post(f"{BASE_URL}/platform/bots/{bot_id}/intents", json=intents_data, headers=auth_headers)
        assert train_resp.status_code == 200, f"Training failed: {train_resp.text}"
        print(f"[OK] Intents Trained (Accuracy: {train_resp.json().get('accuracy')})")

        # Chat (API KEY)
        session_id = f"sess_{uuid.uuid4().hex[:6]}"
        chat_headers = {"X-API-Key": api_key}
        chat_resp = await client.post(
            f"{BASE_URL}/v1/chat/{bot_id}",
            json={"query": "how is the system", "session_id": session_id},
            headers=chat_headers
        )
        assert chat_resp.status_code == 200
        print(f"[OK] Chat Response: {chat_resp.json()['answer']}")

        # Verify History
        hist_resp = await client.get(f"{BASE_URL}/platform/bots/{bot_id}/sessions/{session_id}", headers=auth_headers)
        assert hist_resp.status_code == 200
        messages = hist_resp.json()["messages"]
        assert len(messages) >= 2, "History should contain user + assistant turns"
        print(f"[OK] Persistent History verified ({len(messages)} messages found)")
        print("")


        # -------------------------------------------------------------------
        # 4. ANALYTICS
        # -------------------------------------------------------------------
        print("--- Phase 4: Analytics ---")
        
        ana_resp = await client.get(f"{BASE_URL}/platform/bots/{bot_id}/analytics?days=7", headers=auth_headers)
        assert ana_resp.status_code == 200
        totals = ana_resp.json()["totals"]
        assert totals["total_queries"] >= 1
        print(f"[OK] Analytics verified: Lifetime Queries = {totals['total_queries']}")
        print("")


        # -------------------------------------------------------------------
        # 5. SECURITY HARDENING (EDGE CASES)
        # -------------------------------------------------------------------
        print("--- Phase 5: Security Edge Cases ---")
        
        # 5.1 Invalid JWT
        bad_token_resp = await client.get(f"{BASE_URL}/auth/me", headers={"Authorization": "Bearer invalid"})
        assert bad_token_resp.status_code == 401
        print("[OK] Caught Invalid JWT")

        # 5.2 Mismatched Bot/Key
        other_bot_id = str(uuid.uuid4())
        mismatch_resp = await client.post(
            f"{BASE_URL}/v1/chat/{other_bot_id}",
            json={"query": "hello", "session_id": "test"},
            headers=chat_headers
        )
        assert mismatch_resp.status_code in [403, 401], f"Expected 403 or 401, got {mismatch_resp.status_code}"
        print("[OK] Caught API Key mismatch")

        # 5.3 Validation Hardening (too few examples)
        bad_intent = {"intents": [{"label": "bad", "response": "no", "examples": ["one"]}]}
        val_resp = await client.post(f"{BASE_URL}/platform/bots/{bot_id}/intents", json=bad_intent, headers=auth_headers)
        if val_resp.status_code != 422:
            print(f"[FAIL] Expected 422, got {val_resp.status_code}: {val_resp.text}")
        assert val_resp.status_code == 422
        print("[OK] Caught Schema Validation (min 5 examples)")

        print("\nALL TESTS PASSED! Backend is fully verified and secure.")

if __name__ == "__main__":
    try:
        asyncio.run(run_tests())
    except Exception as e:
        print(f"\nCRITICAL TEST FAILURE: {e}")
        sys.exit(1)
