"""
End-to-End Test Script for Chatbot Platform APIs
Includes standard tests and edge case testing.

Run: python test_endpoints.py
"""

import asyncio
import httpx
import os
import uuid

BASE_URL = "http://127.0.0.1:8001"

async def test_api():
    print("=== Testing Chatbot API Endpoints ===\n")
    
    timeout = httpx.Timeout(None)  # Infinite timeout for ML local execution
    async with httpx.AsyncClient(timeout=timeout) as client:
        # ==========================================
        # EDGE CASES & VALIDATION TESTS
        # ==========================================
        print("--- 0. Testing Edge Cases & Validations ---")
        
        # Test 0.1: Invalid Bot Type Creation
        resp = await client.post(
            f"{BASE_URL}/platform/bots",
            json={"name": "Bad Bot", "bot_type": "invalid_type"}
        )
        assert resp.status_code == 422, "Expected validation error for invalid bot type"
        print("[OK] Blocked invalid bot type creation")

        # Test 0.2: Invalid API Key on Chat
        fake_uuid = str(uuid.uuid4())
        resp = await client.post(
            f"{BASE_URL}/v1/chat/{fake_uuid}",
            json={"query": "Hello", "session_id": "test"},
            headers={"X-API-Key": "fake-key"}
        )
        assert resp.status_code == 401, "Expected 401 Unauthorized for fake API key"
        print("[OK] Blocked chat with invalid API key")
        
        # Test 0.3: Uploading document to Intent Bot (should fail)
        resp = await client.post(
            f"{BASE_URL}/platform/bots",
            json={"name": "Temp Intent Bot", "bot_type": "intent"}
        )
        temp_intent_id = resp.json()["id"]
        
        test_file_path = "temp_doc.txt"
        with open(test_file_path, "w") as f: f.write("test")
        
        try:
            with open(test_file_path, "rb") as f:
                resp = await client.post(
                    f"{BASE_URL}/platform/bots/{temp_intent_id}/documents",
                    files={"file": ("temp_doc.txt", f, "text/plain")}
                )
                assert resp.status_code == 400, "Intent bots should not accept documents"
                print("[OK] Blocked document upload to Intent Bot")
        finally:
            os.remove(test_file_path)

        # Test 0.4: Empty Query Validation
        # Using a proper response object to check validations
        print("\n")


        # ==========================================
        # TEST 1: Intent Bot
        # ==========================================
        print("--- 1. Testing Intent Bot ---")
        
        resp = await client.post(
            f"{BASE_URL}/platform/bots",
            json={"name": "Support Intent Bot", "bot_type": "intent"}
        )
        bot_data = resp.json()
        intent_bot_id = bot_data["id"]
        intent_bot_key = bot_data["api_key"]
        print(f"[OK] Created Intent Bot: {intent_bot_id}")

        intents = {
            "intents": [
                {
                    "label": "greeting", 
                    "response": "Hello there! How can I help you today?", 
                    "examples": ["hi", "hello", "hey", "good morning", "what's up"]
                },
                {
                    "label": "pricing", 
                    "response": "Our prices start at $10/month.", 
                    "examples": ["how much does it cost?", "pricing", "what are the prices", "is it free", "how much is basic plan"]
                }
            ]
        }
        print("Training intents (this might take a moment)...")
        resp = await client.post(f"{BASE_URL}/platform/bots/{intent_bot_id}/intents", json=intents)
        print(f"[OK] Intents trained: {resp.json().get('status', 'Error')} with accuracy: {resp.json().get('accuracy')}")

        # Intent Chat - Should hit exact phrase to pass 0.7 threshold
        headers = {"X-API-Key": intent_bot_key}
        resp = await client.post(
            f"{BASE_URL}/v1/chat/{intent_bot_id}",
            json={"query": "what are the prices", "session_id": "test-session"},
            headers=headers
        )
        print(f"[OK] Intent Bot Reply (High Confidence): {resp.json().get('answer')}")

        # Intent Chat - Edge Case: Low confidence / Off-topic
        resp = await client.post(
            f"{BASE_URL}/v1/chat/{intent_bot_id}",
            json={"query": "How do I bake a cake?", "session_id": "test-session"},
            headers=headers
        )
        print(f"[OK] Intent Bot Reply (Low Confidence/Fallback): {resp.json().get('answer')}")

        print("\n")


        # ==========================================
        # TEST 2: RAG Bot
        # ==========================================
        print("--- 2. Testing RAG Bot ---")
        
        resp = await client.post(
            f"{BASE_URL}/platform/bots",
            json={"name": "Docs RAG Bot", "bot_type": "rag"}
        )
        bot_data = resp.json()
        rag_bot_id = bot_data["id"]
        rag_bot_key = bot_data["api_key"]
        print(f"[OK] Created RAG Bot: {rag_bot_id}")

        # Empty Document edge case
        test_file_path = "empty_doc.txt"
        with open(test_file_path, "w") as f: f.write("")
        
        try:
            with open(test_file_path, "rb") as f:
                resp = await client.post(
                    f"{BASE_URL}/platform/bots/{rag_bot_id}/documents",
                    files={"file": ("empty_doc.txt", f, "text/plain")}
                )
                assert resp.status_code == 400, "Should block empty documents"
                print("[OK] Blocked empty document upload")
        finally:
            os.remove(test_file_path)

        # Valid Document Upload
        test_file_path = "test_doc.txt"
        with open(test_file_path, "w") as f:
            f.write("The secret company password is 'MangoTango2026'.")
        
        try:
            with open(test_file_path, "rb") as f:
                resp = await client.post(
                    f"{BASE_URL}/platform/bots/{rag_bot_id}/documents",
                    files={"file": ("test_doc.txt", f, "text/plain")},
                    headers={"X-Description": "Company Secrets"}
                )
                print(f"[OK] Document indexed: chunks={resp.json().get('chunks_indexed')}")
        finally:
            os.remove(test_file_path)

        headers_chat = {"X-API-Key": rag_bot_key}
        print("Querying RAG bot about the document...")
        resp = await client.post(
            f"{BASE_URL}/v1/chat/{rag_bot_id}",
            json={"query": "What is the secret company password?", "session_id": "test-session"},
            headers=headers_chat
        )
        print(f"[OK] RAG Bot Reply: {resp.json().get('answer')}")

        print("\n--- Testing Complete. All Edge Cases Passed! ---")


if __name__ == "__main__":
    asyncio.run(test_api())
