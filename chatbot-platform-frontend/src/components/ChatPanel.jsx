import React, { useState, useRef, useEffect } from 'react';
import { sendChat, streamChat } from '../api/client';

export default function ChatPanel({ botId, botType, apiKey, embedded = false }) {
  const [isOpen, setIsOpen] = useState(embedded);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [isStream, setIsStream] = useState(false);
  const messagesEndRef = useRef(null);

  // Generate a fixed test session ID for this panel's lifespan
  const [sessionId] = useState(`preview_${Math.random().toString(36).substring(2, 6)}`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  // Clear messages if closed to save memory/state
  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isReceiving || !apiKey) return;

    const query = input.trim();
    setInput('');
    
    const newMessages = [...messages, { role: 'user', content: query }];
    setMessages(newMessages);
    setIsReceiving(true);

    if (isStream) {
      let assistantMessage = { role: 'assistant', content: '', source_type: null };
      setMessages([...newMessages, assistantMessage]);

      try {
        let fullText = '';
        streamChat(
          botId, 
          apiKey, 
          query, 
          sessionId, 
          (token) => {
            fullText += token;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullText };
              return updated;
            });
          },
          () => {
            // Done
            setIsReceiving(false);
          }
        );
      } catch (err) {
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}`, error: true }]);
        setIsReceiving(false);
      }
    } else {
      try {
        const data = await sendChat(botId, apiKey, query, sessionId);
        setMessages([...newMessages, { role: 'assistant', content: data.answer, source_type: data.source_type }]);
      } catch (err) {
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}`, error: true }]);
      } finally {
        setIsReceiving(false);
      }
    }
  };

  const sourceTypeBadge = (type) => {
    if (!type) return null;
    const colors = {
      intent: 'bg-purple-100 text-purple-700 border-purple-200',
      rag: 'bg-blue-100 text-blue-700 border-blue-200',
      cache: 'bg-amber-100 text-amber-700 border-amber-200'
    };
    const c = colors[type] || 'bg-gray-100 text-gray-700 border-gray-200';
    return (
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${c} ml-2`}>
        {type}
      </span>
    );
  };

  return (
    <div className="mt-12 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
      {/* Header / Toggle - Hidden in embedded mode */}
      {!embedded && (
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-left">Test Chat</h4>
              <p className="text-xs text-gray-500 font-medium">Quickly interact with your bot inline.</p>
            </div>
          </div>
          <svg className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </button>
      )}

      {/* Chat Body */}
      {isOpen && (
        <div className={`flex flex-col ${!embedded ? 'border-t border-gray-200 h-[400px]' : 'h-[600px]'}`}>
          
          {/* Controls Bar */}
          <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs">
            <span className="font-mono text-gray-500">Session: {sessionId}</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-400 uppercase tracking-widest text-[10px]">Mode</span>
              <button 
                onClick={() => setIsStream(false)}
                className={`px-2 py-1 rounded font-bold transition-all ${!isStream ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-200'}`}
              >
                Standard
              </button>
              <button 
                onClick={() => setIsStream(true)}
                className={`px-2 py-1 rounded font-bold transition-all ${isStream ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-200'}`}
              >
                Stream
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 relative">
            {!apiKey && (
              <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                <svg className="w-10 h-10 text-amber-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                <h5 className="font-black text-gray-900 mb-1">API Key Required</h5>
                <p className="text-sm text-gray-500 max-w-xs">You must generate or retrieve your API Key from the Integration tab before testing.</p>
              </div>
            )}
            
            {messages.length === 0 && apiKey && (
              <div className="h-full flex items-center justify-center text-gray-400 font-medium text-sm">
                Ask something to test your bot
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white shadow-md rounded-br-none' 
                    : msg.error 
                      ? 'bg-red-50 text-red-700 border border-red-100 rounded-bl-none'
                      : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-bl-none'
                }`}>
                  <div className="whitespace-pre-wrap leading-relaxed font-medium">
                    {msg.content || (msg.role === 'assistant' ? <span className="animate-pulse">● ● ●</span> : '')}
                  </div>
                  {msg.role === 'assistant' && msg.source_type && (
                     <div className="mt-2 text-right">
                       {sourceTypeBadge(msg.source_type)}
                     </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-100">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder={apiKey ? "Type your message..." : "API key required"}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={isReceiving || !apiKey}
              />
              <button
                type="submit"
                disabled={!input.trim() || isReceiving || !apiKey}
                className="bg-slate-900 text-white px-5 py-3 rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Send
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
