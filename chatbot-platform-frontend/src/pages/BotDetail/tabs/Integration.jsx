import React, { useState, useEffect } from 'react';
import { useApi } from '../../../hooks/useApi';
import { getSnippet, regenerateApiKey } from '../../../api/client';
import Spinner from '../../../components/Spinner';
import ErrorBanner from '../../../components/ErrorBanner';
import ConfirmModal from '../../../components/ConfirmModal';

export default function Integration({ botId, apiKey, setApiKey }) {
  const [snippet, setSnippet] = useState(null);
  const [baseUrl, setBaseUrl] = useState(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001');
  const [activeTab, setActiveTab] = useState('javascript');
  const [copySuccess, setCopySuccess] = useState(false);
  const [keyCopySuccess, setKeyCopySuccess] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  
  const { loading, error, call, clearError } = useApi();

  useEffect(() => {
    const fetchSnippet = async () => {
      try {
        const data = await call(getSnippet, botId, baseUrl);
        setSnippet(data);
      } catch (err) {
        // Error handled by useApi
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchSnippet();
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [botId, baseUrl, call]);

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setKeyCopySuccess(true);
      setTimeout(() => setKeyCopySuccess(false), 2000);
    } else {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const data = await call(regenerateApiKey, botId);
      setApiKey(data.api_key);
      setShowKey(true);
    } catch (err) {
      // Error handled by useApi
    } finally {
      setIsRegenerating(false);
      setShowRegenerateModal(false);
    }
  };

  if (!snippet && loading) return <Spinner />;

  // Format the display key based on state
  const displayKey = !apiKey 
    ? "Generating..." 
    : showKey ? apiKey : `cbp_${'*'.repeat(24)}`;

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <ErrorBanner message={error} onDismiss={clearError} />

      <ConfirmModal
        isOpen={showRegenerateModal}
        title="Regenerate API Key?"
        message="This revokes the current key immediately. Any application using it will receive 401 Unauthorized errors until updated with the new key."
        confirmLabel={isRegenerating ? "Regenerating..." : "Yes, regenerate key"}
        onConfirm={handleRegenerate}
        onCancel={() => setShowRegenerateModal(false)}
        danger={true}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        
        {/* LEFT COLUMN - API Key Management */}
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">API Key</h3>
            <p className="text-gray-500 font-medium text-sm mt-1">Authenticate your requests to the chatbot platform.</p>
          </div>

          <div className="bg-white border rounded-2xl p-6 shadow-sm">
            {apiKey === null && !loading ? (
               <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm font-medium border border-amber-200">
                  <span className="font-bold block mb-1">Legacy Token</span>
                  Your API key was created before encrypted storage was added. Click regenerate to issue a persistent key.
               </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div className="flex-1 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl font-mono text-sm text-slate-800 break-all">
                    {displayKey}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowKey(!showKey)}
                      disabled={!apiKey}
                      className="p-3 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border shadow-sm bg-white disabled:opacity-50"
                      title={showKey ? "Hide Key" : "Show Key"}
                    >
                      {showKey ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleCopy(apiKey, 'key')}
                      disabled={!apiKey}
                      className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {keyCopySuccess ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg> Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
            
            <div className="mt-8 pt-6 border-t flex justify-end">
              <button
                onClick={() => setShowRegenerateModal(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                Regenerate Key
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Snippets */}
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Integration Snippets</h3>
            <p className="text-gray-500 font-medium text-sm mt-1">Ready-to-use code for embedding the bot.</p>
          </div>

          <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full border border-slate-800">
            {/* Header & Tabs */}
            <div className="bg-slate-900 border-b border-slate-800 p-4">
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Base API URL</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 bg-slate-800 border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 bg-slate-800 p-1 rounded-lg">
                {['javascript', 'python_code', 'curl'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 text-center py-2 px-3 rounded-md text-xs font-bold transition-all ${
                      activeTab === tab
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {tab === 'python_code' ? 'PYTHON' : tab.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Code Area */}
            <div className="relative flex-1 bg-[#0d1117] p-6 overflow-x-auto">
              <button
                onClick={() => handleCopy(snippet?.[activeTab], 'snippet')}
                className="absolute top-4 right-4 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700 group"
                title="Copy snippet"
              >
                {copySuccess ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <pre className="text-sm font-mono text-slate-300 leading-relaxed font-medium">
                <code>{snippet ? snippet[activeTab] : 'Loading...'}</code>
              </pre>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
