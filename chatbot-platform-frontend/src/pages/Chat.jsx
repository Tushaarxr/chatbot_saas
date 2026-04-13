// src/pages/Chat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { sendChat, streamChat, getBot } from '../api/client';
import { useApi } from '../hooks/useApi';
import Spinner from '../components/Spinner';

export default function Chat() {
  const { botId } = useParams();
  const [bot, setBot] = useState(null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [sessionId, setSessionId] = useState(`demo_${Math.random().toString(36).substring(7)}`);
  const [apiKey, setApiKey] = useState('');
  const [streamMode, setStreamMode] = useState(false);
  
  const scrollRef = useRef(null);
  const { loading, call } = useApi();

  useEffect(() => {
    // Fetch bot info for the name
    const fetchBot = async () => {
      try {
        const data = await getBot(botId);
        setBot(data);
        
        // Auto-fill API key if found in session
        const savedKey = sessionStorage.getItem(`chat_api_key_${botId}`);
        if (savedKey) setApiKey(savedKey);
      } catch (err) {}
    };
    fetchBot();
  }, [botId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || !apiKey || loading) return;

    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    setQuery('');

    if (streamMode) {
      handleStreaming(query);
    } else {
      handleStandard(query);
    }
  };

  const handleStandard = async (q) => {
    try {
      const resp = await call(sendChat, botId, apiKey, q, sessionId);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: resp.answer, 
        source_type: resp.source_type 
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, error: true }]);
    }
  };

  const handleStreaming = (q) => {
    let currentContent = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    streamChat(botId, apiKey, q, sessionId, 
      (token) => {
        currentContent += token;
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1].content = currentContent;
          return next;
        });
      },
      () => {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1].streaming = false;
          return next;
        });
      }
    );
  };

  return (
    <div className="flex flex-col h-[800px] bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-4">
          <Link to={`/bots/${botId}`} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h3 className="text-xl font-black tracking-tight">{bot?.name || 'Chat Agent'}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Testing Sandbox</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-xl border border-slate-700">
          <button 
            onClick={() => setStreamMode(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!streamMode ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Standard
          </button>
          <button 
            onClick={() => setStreamMode(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${streamMode ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Streaming
          </button>
        </div>
      </div>

      {/* API Key Awareness */}
      {!apiKey && (
        <div className="bg-amber-50 border-b border-amber-100 p-4 text-center">
          <p className="text-sm font-bold text-amber-800 border-2 border-dashed border-amber-200 py-2 rounded-xl">
            API Key Required to Chat. Check Bot Detail → Integration tab.
          </p>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/30"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center border border-gray-100 shadow-sm text-gray-200">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-900 font-bold">Start a Conversation</p>
              <p className="text-gray-400 text-sm font-medium">Test your bot's intelligence in real-time.</p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[75%] px-5 py-4 rounded-3xl text-sm font-medium shadow-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-none'
                : msg.error 
                  ? 'bg-red-50 text-red-700 border border-red-100'
                  : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
            }`}>
              {msg.content || (msg.streaming ? '...' : '')}
            </div>
            
            <div className="mt-1.5 flex items-center gap-2 px-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                {msg.role === 'user' ? 'You' : bot?.name || 'Bot'}
              </span>
              {msg.source_type && (
                <span className={`text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded border border-blue-100 bg-blue-50 text-blue-600`}>
                  Source: {msg.source_type}
                </span>
              )}
            </div>
          </div>
        ))}

        {loading && !streamMode && (
          <div className="flex items-start animate-pulse">
            <div className="bg-gray-100 px-5 py-4 rounded-3xl rounded-tl-none border border-gray-200">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 bg-white border-t border-gray-100">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              required
              disabled={!apiKey || loading}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium text-sm disabled:opacity-50"
              placeholder={apiKey ? "Type your message..." : "Configure API Key first..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className={`absolute left-4 top-1/2 -translate-y-1/2 ${apiKey ? 'text-blue-500' : 'text-gray-300'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <button
            type="submit"
            disabled={!apiKey || loading || !query.trim()}
            className={`px-8 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg ${
              !apiKey || loading || !query.trim()
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-1'
            }`}
          >
            {loading && !streamMode ? 'Waiting' : 'Send'}
          </button>
        </form>
        
        <div className="mt-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex gap-6">
            <div className="flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-tighter text-gray-400">API Key</label>
              <input 
                type="password"
                className="bg-transparent border-none p-0 text-xs font-mono text-blue-600 focus:ring-0 w-32"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="cbp_xxxx"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-tighter text-gray-400">Session ID</label>
              <input 
                type="text"
                className="bg-transparent border-none p-0 text-xs font-mono text-gray-600 focus:ring-0 w-24"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 font-medium">Use Shift+Enter for new line (if applicable)</p>
        </div>
      </div>
    </div>
  );
}
