// src/pages/BotDetail.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { getBot } from '../api/client';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';

// Tabs
import Overview from './BotDetail/tabs/Overview';
import Documents from './BotDetail/tabs/Documents';
import Intents from './BotDetail/tabs/Intents';
import History from './BotDetail/tabs/History';
import Analytics from './BotDetail/tabs/Analytics';
import Integration from './BotDetail/tabs/Integration';
import Playground from './BotDetail/tabs/Playground';

export default function BotDetail() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [bot, setBot] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [newApiKey, setNewApiKey] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  
  const { loading, error, call, clearError } = useApi();

  useEffect(() => {
    const fetchBot = async () => {
      try {
        const data = await call(getBot, botId);
        setBot(data);
        
        // Also fetch the persistent API key
        try {
          const { getApiKey } = await import('../api/client');
          const keyData = await getApiKey(botId);
          if (keyData) setApiKey(keyData.api_key);
        } catch (e) {
          // If 404 (legacy bot), that's fine, Integration tab will show warning
        }
      } catch (err) {
        if (err.message.includes('404')) {
          navigate('/404');
        }
      }
    };
    fetchBot();

    // Check for new API key in sessionStorage
    const savedKey = sessionStorage.getItem(`new_bot_api_key_${botId}`);
    if (savedKey) {
      setNewApiKey(savedKey);
    }
  }, [botId, navigate]);

  const dismissApiKey = () => {
    setNewApiKey(null);
    sessionStorage.removeItem(`new_bot_api_key_${botId}`);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'playground', label: 'Test Lab', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'documents', label: 'Documents', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', visible: bot?.bot_type !== 'intent' },
    { id: 'intents', label: 'Intents', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.638.319a4 4 0 01-3.533.03l-.308-.154a3 3 0 00-2.091-.232l-1.455.364a2 2 0 00-1.487 1.944V19a2 2 0 002 2h12a2 2 0 002-2v-3.572a2 2 0 00-.572-1.414z', visible: bot?.bot_type === 'intent' },
    { id: 'history', label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'integration', label: 'Integration', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  ].filter(t => t.visible !== false);

  if (loading && !bot) return <Spinner />;
  if (!bot) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider border border-blue-200">
              {bot.bot_type.replace('_', ' ')}
            </span>
            <span className="text-gray-400 text-sm font-medium">
              ID: {bot.id.slice(0, 8)}...
            </span>
          </div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">{bot.name}</h2>
          <p className="text-gray-500 font-medium mt-1">Configure, train, and track your bot's performance.</p>
        </div>
        
        <Link
          to={`/bots/${botId}/chat`}
          onClick={() => {
            if (newApiKey) {
              sessionStorage.setItem(`chat_api_key_${botId}`, newApiKey);
            }
          }}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition-all shadow-xl hover:-translate-y-1 active:translate-y-0"
        >
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Launch Chat Demo
        </Link>
      </div>

      {newApiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-full text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <p className="text-amber-900 font-bold">New API Key Generated</p>
              <p className="text-amber-700 text-sm font-medium">You can always find this key in the Integration tab later.</p>
              <code className="mt-2 block bg-white border border-amber-100 p-2 rounded-lg text-amber-900 font-mono text-sm break-all">
                {newApiKey}
              </code>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={() => navigator.clipboard.writeText(newApiKey)}
              className="flex-1 md:flex-none px-4 py-2 bg-white border border-amber-200 text-amber-700 rounded-lg font-bold hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
            >
              Copy
            </button>
            <button
              onClick={dismissApiKey}
              className="flex-1 md:flex-none px-4 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={clearError} />

      {/* Dynamic Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap -mb-px gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-bold text-sm transition-all duration-200 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && <Overview bot={bot} setBot={setBot} apiKey={apiKey} />}
        {activeTab === 'playground' && <Playground botId={botId} bot={bot} apiKey={apiKey} />}
        {activeTab === 'documents' && <Documents botId={botId} bot={bot} apiKey={apiKey} />}
        {activeTab === 'intents' && <Intents botId={botId} apiKey={apiKey} />}
        {activeTab === 'history' && <History botId={botId} />}
        {activeTab === 'analytics' && <Analytics botId={botId} />}
        {activeTab === 'integration' && <Integration botId={botId} apiKey={apiKey} setApiKey={setApiKey} />}
      </div>
    </div>
  );
}
