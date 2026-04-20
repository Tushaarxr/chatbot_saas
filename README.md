# Chatbot SaaS Monorepo

This repository contains a fully standalone, multi-tenant Chatbot-as-a-Service system capable of handling Intent-based and RAG-based AI interactions.

## Architecture

The project is structured as a monorepo consisting of:
- **[chatbot-platform](./chatbot-platform/)**: The Python FastAPI backend handling logic, semantic caching, vector embeddings, intent classification, and database management.
- **[chatbot-platform-frontend](./chatbot-platform-frontend/)**: The React frontend providing a robust management dashboard to build, configure, test, and retrieve integration keys for the bots.

## Features & Highlights

- **Multi-tenant isolation**: Every user manages their own bots with independent contexts, API keys, and document namespaces.
- **Dynamic Chunking**: Optimize memory retention and LLM context windows dynamically via the frontend UI when uploading documents to RAG bots.
- **Malware Defense Layer**: All document uploads are aggressively scanned using ClamAV embedded within Docker before processing vectors (`services/malware_scanner.py`).
- **Semantic Caching**: Automatically bypasses LLM inference for duplicate queries to drastically reduce latency and computational load.
- **CI/CD Built-in**: Full GitHub Actions pipelines for automated Unit Testing, Integration Testing, Static Code Security Audits (via Bandit), and zero-downtime deployment pipelines targeting bare-metal/VM instances.

## Development Setup

### 1. Malware Protection (ClamAV)
For the malware scanner to function locally, you must be running Docker:
```bash
docker run -d --name clamav -p 3310:3310 --restart always clamav/clamav:stable
```

### 2. Backend
Navigate to the backend and activate your virtual environment:
```bash
cd chatbot-platform
pip install -r requirements.txt
python db/migrations.py
uvicorn main:app --port 8001 --reload
```

### 3. Frontend
Navigate to the frontend directory:
```bash
cd chatbot-platform-frontend
npm install
npm run dev
```

*For detailed architectural documentation, refer to the respective sub-directories.*
