# Chatbot Platform

A fully standalone, multi-tenant Chatbot-as-a-Service system.

Provides a unified REST API to create and interact with:
- **Intent Bots**: Fixed responses based on AI classification (DistilBERT).
- **RAG Bots**: Document Q&A over uploaded PDFs/TXTs (Qwen2.5-3B + FAISS).
- **Persona Bots**: RAG bots enhanced with specific system instructions/personalities.

## Getting Started

1. **Install Python dependencies:**
   ```bash
   pip install torch --index-url https://download.pytorch.org/whl/cpu
   pip install -r requirements.txt
   ```

2. **Set up Environment Variables:**
   A `.env` file is required. Review the default configurations in `.env`. Ensure your LM Studio is running on `localhost:1234`.

3. **Check connections:**
   ```bash
   python test_connections.py
   ```

4. **Launch Server:**
   ```bash
   uvicorn main:app --port 8001 --reload
   ```

Check the API docs at [http://localhost:8001/docs](http://localhost:8001/docs).
