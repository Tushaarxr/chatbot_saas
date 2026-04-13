// src/pages/BotDetail/tabs/History.jsx
import React, { useState, useEffect } from 'react';
import { useApi } from '../../../hooks/useApi';
import { listSessions, getSession, deleteSession } from '../../../api/client';
import Spinner from '../../../components/Spinner';
import ErrorBanner from '../../../components/ErrorBanner';
import ConfirmModal from '../../../components/ConfirmModal';

export default function History({ botId }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showDelete, setShowDelete] = useState(false);
  
  const { loading: sessionsLoading, error: sessionsError, call: callSessions, clearError: clearSessionsError } = useApi();
  const { loading: msgsLoading, call: callMsgs } = useApi();

  useEffect(() => {
    fetchSessions();
  }, [botId]);

  const fetchSessions = async () => {
    try {
      const data = await callSessions(listSessions, botId);
      setSessions(data || []);
    } catch (err) {}
  };

  const handleSelectSession = async (sessionId) => {
    setSelectedSession(sessionId);
    try {
      const data = await callMsgs(getSession, botId, sessionId);
      setMessages(data.messages || []);
    } catch (err) {}
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    try {
      await callSessions(deleteSession, botId, selectedSession);
      setSessions(sessions.filter(s => s.session_id !== selectedSession));
      setSelectedSession(null);
      setMessages([]);
      setShowDelete(false);
    } catch (err) {}
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div className="flex h-[600px] bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm animate-in fade-in duration-500">
      {/* Sidebar - Sessions List */}
      <div className="w-80 border-r border-gray-100 flex flex-col bg-gray-50/50">
        <div className="p-4 border-b border-gray-100 bg-white">
          <h3 className="font-black text-gray-900 tracking-tight">Chat Sessions</h3>
          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-1">Live History</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {sessionsLoading && sessions.length === 0 && <Spinner />}
          <ErrorBanner message={sessionsError} onDismiss={clearSessionsError} />
          
          {sessions.length === 0 && !sessionsLoading && (
            <div className="p-8 text-center">
              <p className="text-gray-400 text-sm font-medium">No sessions found.</p>
            </div>
          )}

          {sessions.map((session) => (
            <button
              key={session.session_id}
              onClick={() => handleSelectSession(session.session_id)}
              className={`w-full text-left p-4 rounded-2xl transition-all duration-200 border ${
                selectedSession === session.session_id
                  ? 'bg-white border-blue-200 shadow-md shadow-blue-50'
                  : 'border-transparent hover:bg-white hover:border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`font-mono text-xs ${selectedSession === session.session_id ? 'text-blue-600' : 'text-gray-400'}`}>
                  {session.session_id.slice(0, 12)}...
                </span>
                <span className="text-[10px] font-bold text-gray-400">{timeAgo(session.last_active)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                <span className="text-gray-900">{session.message_count} messages</span>
                {selectedSession === session.session_id && (
                  <span className="text-blue-600 animate-pulse text-[8px]">Active</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Area - Messages */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedSession ? (
          <>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <h3 className="font-bold text-gray-900">Session View</h3>
              </div>
              <button
                onClick={() => setShowDelete(true)}
                className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                title="Permanently remove this session"
              >
                Delete Session
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {msgsLoading && messages.length === 0 && <Spinner />}
              
              {messages.map((msg, idx) => (
                <div 
                  key={msg.id || idx} 
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-medium shadow-sm transition-all ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200'
                  }`}>
                    {msg.content}
                  </div>
                  <div className="flex gap-2 mt-1 px-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </span>
                    {msg.source_type && (
                      <span className={`text-[8px] font-black uppercase tracking-tighter px-1 rounded border ${
                        msg.source_type === 'rag' ? 'text-blue-500 border-blue-200' : 'text-purple-500 border-purple-200'
                      }`}>
                        {msg.source_type}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {messages.length === 0 && !msgsLoading && (
                <div className="h-full flex items-center justify-center text-gray-400 font-medium italic">
                  No messages recorded in this session.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center text-gray-400 font-medium">
            <div className="bg-gray-50 w-16 h-16 rounded-3xl mb-4 flex items-center justify-center text-gray-200 border border-gray-100">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
            </div>
            Select a session from the list to view the full dialogue history.
          </div>
        )}
      </div>

      {showDelete && (
        <ConfirmModal
          message="Delete this entire chat history session? This cannot be undone."
          onConfirm={handleDeleteSession}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
