// src/api/client.js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("cbp_token");
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token && !options.noAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  if (response.status === 204) return null;

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || 'Something went wrong');
  }

  return data;
}

// AUTH
export async function register(email, displayName, password) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, display_name: displayName, password }),
    noAuth: true,
  });
}

export async function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    noAuth: true,
  });
}

export async function getMe() {
  return request('/auth/me');
}

// BOTS
export async function listBots() {
  return request('/platform/bots');
}

export async function createBot(data) {
  return request('/platform/bots', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getBot(botId) {
  return request(`/platform/bots/${botId}`);
}

export async function updateBot(botId, fields) {
  return request(`/platform/bots/${botId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function deleteBot(botId) {
  return request(`/platform/bots/${botId}`, {
    method: 'DELETE',
  });
}

// DOCUMENTS
export async function uploadDocument(botId, file, description) {
  const formData = new FormData();
  formData.append('file', file);
  
  return request(`/platform/bots/${botId}/documents`, {
    method: 'POST',
    headers: {
      'X-Description': description || '',
    },
    body: formData,
    // Note: Request helper sets Content-Type to JSON by default. 
    // For FormData, we must let fetch set it with the boundary.
  });
}

// Overwrite request for multipart to handle headers correctly
export async function uploadDocumentSafe(botId, file, description) {
  const token = localStorage.getItem("cbp_token");
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/platform/bots/${botId}/documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Description': description || '',
    },
    body: formData,
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || 'Upload failed');
  }
  return data;
}

// INTENTS
export async function trainIntents(botId, intents) {
  // Filter empty examples from each intent to prevent 422 errors
  const filteredIntents = intents.map(intent => ({
    ...intent,
    examples: intent.examples.filter(ex => ex.trim() !== '')
  }));

  return request(`/platform/bots/${botId}/intents`, {
    method: 'POST',
    body: JSON.stringify({ intents: filteredIntents }),
  });
}

// HISTORY
export async function listSessions(botId) {
  return request(`/platform/bots/${botId}/sessions`);
}

export async function getSession(botId, sessionId) {
  return request(`/platform/bots/${botId}/sessions/${sessionId}`);
}

export async function deleteSession(botId, sessionId) {
  return request(`/platform/bots/${botId}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

// ANALYTICS
export async function getAnalytics(botId, days = 30) {
  return request(`/platform/bots/${botId}/analytics?days=${days}`);
}

// SNIPPET / INTEGRATION
export async function getSnippet(botId, baseUrl) {
  return request(`/platform/bots/${botId}/snippet?base_url=${baseUrl}`);
}

export async function getApiKey(botId) {
  return request(`/platform/bots/${botId}/api-key`);
}

export async function regenerateApiKey(botId) {
  return request(`/platform/bots/${botId}/api-key/regenerate`, {
    method: 'POST',
  });
}

// DOCUMENTS
export async function listDocuments(botId) {
  return request(`/platform/bots/${botId}/documents`);
}

export async function deleteDocument(botId, documentId) {
  return request(`/platform/bots/${botId}/documents/${documentId}`, {
    method: 'DELETE',
  });
}

// CHAT (uses X-API-Key)
export async function sendChat(botId, apiKey, query, sessionId) {
  return request(`/v1/chat/${botId}`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: JSON.stringify({ query, session_id: sessionId }),
    noAuth: true,
  });
}

export function streamChat(botId, apiKey, query, sessionId, onToken, onDone) {
  const controller = new AbortController();
  
  (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/chat/${botId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ query, session_id: sessionId }),
        signal: controller.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onDone();
            } else {
              onToken(data);
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }
  })();

  return () => controller.abort();
}
