"""
Snippet generator — produces ready-to-paste integration code for each bot.
"""

from models.schemas import SnippetResponse


def generate(bot_id: str, base_url: str = "http://localhost:8001") -> SnippetResponse:
    """
    Generate JavaScript, Python, and curl snippets for integrating a bot.

    Args:
        bot_id:   The bot's UUID string.
        base_url: The server base URL (e.g. "http://localhost:8001").

    Returns:
        SnippetResponse with three ready-to-use code strings.
    """
    endpoint = f"{base_url}/v1/chat/{bot_id}"

    js = f"""// JavaScript (fetch)
const response = await fetch('{endpoint}', {{
  method: 'POST',
  headers: {{ 'Content-Type': 'application/json', 'X-API-Key': 'YOUR_API_KEY' }},
  body: JSON.stringify({{ query: userMessage, session_id: sessionId }})
}});
const {{ answer }} = await response.json();"""

    py = f"""# Python
import requests
resp = requests.post(
    '{endpoint}',
    headers={{'X-API-Key': 'YOUR_API_KEY'}},
    json={{'query': 'Hello', 'session_id': 'sess-001'}}
)
print(resp.json()['answer'])"""

    curl = (
        f"curl -X POST {endpoint} \\\n"
        f"  -H 'Content-Type: application/json' \\\n"
        f"  -H 'X-API-Key: YOUR_API_KEY' \\\n"
        f"  -d '{{\"query\": \"Hello\", \"session_id\": \"sess-001\"}}'"
    )

    return SnippetResponse(bot_id=bot_id, javascript=js, python_code=py, curl=curl)


# Legacy alias
def generate_snippets(bot_id: str, base_url: str = "http://localhost:8001") -> SnippetResponse:
    """Deprecated alias for generate(). Use generate() directly."""
    return generate(bot_id, base_url)
