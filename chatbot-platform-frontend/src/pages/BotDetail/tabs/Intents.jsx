// src/pages/BotDetail/tabs/Intents.jsx
import React, { useState } from 'react';
import { useApi } from '../../../hooks/useApi';
import { trainIntents } from '../../../api/client';
import Spinner from '../../../components/Spinner';
import ErrorBanner from '../../../components/ErrorBanner';

export default function Intents({ botId, apiKey }) {
  const [intents, setIntents] = useState([
    { label: '', response: '', examples: ['', '', '', '', ''] },
    { label: '', response: '', examples: ['', '', '', '', ''] }
  ]);
  const [result, setResult] = useState(null);
  const [showHelper, setShowHelper] = useState(true);
  
  const { loading, error, call, clearError } = useApi();

  const handleIntentChange = (idx, field, value) => {
    const newIntents = [...intents];
    newIntents[idx][field] = value;
    setIntents(newIntents);
  };

  const handleExampleChange = (intentIdx, exIdx, value) => {
    const newIntents = [...intents];
    newIntents[intentIdx].examples[exIdx] = value;
    setIntents(newIntents);
  };

  const addExample = (intentIdx) => {
    const newIntents = [...intents];
    newIntents[intentIdx].examples.push('');
    setIntents(newIntents);
  };

  const removeExample = (intentIdx, exIdx) => {
    const newIntents = [...intents];
    newIntents[intentIdx].examples.splice(exIdx, 1);
    setIntents(newIntents);
  };

  const addIntent = () => {
    setIntents([...intents, { label: '', response: '', examples: ['', '', '', '', ''] }]);
  };

  const removeIntent = (idx) => {
    if (intents.length <= 2) return; // Keep at least 2 for classifier
    const newIntents = [...intents];
    newIntents.splice(idx, 1);
    setIntents(newIntents);
  };

  const labelRegex = /^[\w_]+$/;

  const isFormValid = intents.length >= 2 && intents.every(intent => 
    intent.label.trim() !== '' && 
    labelRegex.test(intent.label) &&
    intent.response.trim() !== '' && 
    intent.examples.filter(ex => ex.trim() !== '').length >= 5
  );

  const handleTrain = async () => {
    try {
      const data = await call(trainIntents, botId, intents);
      setResult(data);
    } catch (err) {
      // Error handled by useApi
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <ErrorBanner message={error} onDismiss={clearError} />

      {/* NEW: Onboarding Helper */}
      {showHelper && (
        <section className="bg-blue-600 rounded-3xl p-8 text-white shadow-2xl shadow-blue-200 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-500">
            <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <h3 className="text-2xl font-black tracking-tight mb-4">What is an "Intent"?</h3>
              <button onClick={() => setShowHelper(false)} className="text-white/60 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">1</div>
                <p className="font-bold text-lg">Categories</p>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Think of intents as **"buckets"** for questions. For example, one bucket for "Refunds" and another for "Store Hours".
                </p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">2</div>
                <p className="font-bold text-lg">Examples</p>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Teach the bot by giving 5+ examples of how a human might ask for that bucket. It learns to recognize the **meaning**, not just keywords.
                </p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">3</div>
                <p className="font-bold text-lg">Fixed Answer</p>
                <p className="text-blue-100 text-sm leading-relaxed">
                  When the bot detects a bucket, it gives the **exact response** you type here. No hallucinations!
                </p>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              To work, a classifier needs at least 2 different buckets to compare against.
            </div>
          </div>
        </section>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black text-gray-900 tracking-tight">Intent Training</h3>
          <p className="text-gray-500 font-medium">Define your categories and train the intelligence.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all ${
            intents.length >= 2 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
          }`}>
            {intents.length < 2 ? 'At least 2 required' : `${intents.length} Intents Added`}
          </span>
          <button
            onClick={addIntent}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-100 hover:-translate-y-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Bucket
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {intents.map((intent, iIdx) => (
          <div key={iIdx} className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm relative group animate-in slide-in-from-left-4 duration-300" style={{ animationDelay: `${iIdx * 100}ms` }}>
            {intents.length > 2 && (
              <button
                onClick={() => removeIntent(iIdx)}
                className="absolute top-6 right-6 text-gray-300 hover:text-red-500 transition-colors"
                title="Remove Intent"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Bucket Name (ID)</label>
                <input
                  type="text"
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all font-black uppercase tracking-tight ${
                    intent.label && !labelRegex.test(intent.label) 
                      ? 'border-red-300 bg-red-50 text-red-900 focus:ring-red-500' 
                      : 'border-gray-100 bg-gray-50 text-gray-900 focus:ring-blue-500'
                  }`}
                  placeholder="e.g. PRICING"
                  value={intent.label}
                  onChange={(e) => handleIntentChange(iIdx, 'label', e.target.value)}
                />
                {intent.label && !labelRegex.test(intent.label) && (
                  <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">No spaces allowed. Use underscores.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Fixed Answer</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder="The bot will say exactly this..."
                  value={intent.response}
                  onChange={(e) => handleIntentChange(iIdx, 'response', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Example Phrases (min 5)</label>
              {intent.examples.map((ex, eIdx) => (
                <div key={eIdx} className="flex gap-2 group/ex">
                  <input
                    type="text"
                    className="flex-1 px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-sm font-medium"
                    placeholder={`e.g. "How much does it cost?"`}
                    value={ex}
                    onChange={(e) => handleExampleChange(iIdx, eIdx, e.target.value)}
                  />
                  {intent.examples.length > 5 && (
                    <button
                      onClick={() => removeExample(iIdx, eIdx)}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/ex:opacity-100"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => addExample(iIdx)}
                  className="text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors"
                >
                  + Add more variation
                </button>
                {intent.examples.filter(ex => ex.trim() !== '').length < 5 && (
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider bg-amber-50 px-2 py-1 rounded">
                    {5 - intent.examples.filter(ex => ex.trim() !== '').length} more examples needed
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-10 right-10 z-20">
        <button
          onClick={handleTrain}
          disabled={!isFormValid || loading}
          className={`flex items-center gap-3 px-10 py-5 rounded-2xl font-black text-lg transition-all shadow-2xl ${
            !isFormValid || loading
              ? 'bg-gray-300 text-white cursor-not-allowed opacity-80'
              : 'bg-slate-900 text-white hover:bg-black hover:-translate-y-2 translate-up'
          }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Fine-Tuning AI...
            </>
          ) : (
            <>
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Deploy Classifier
              {!isFormValid && (
                <span className="text-[10px] ml-2 font-bold px-2 py-0.5 bg-white/10 rounded">Incomplete</span>
              )}
            </>
          )}
        </button>
      </div>

      {result && (
        <section className="bg-emerald-600 rounded-3xl p-8 text-white animate-in zoom-in-95 duration-300 mb-10 shadow-2xl shadow-emerald-200">
          <div className="flex items-center gap-6">
            <div className="bg-white/20 p-4 rounded-2xl shadow-inner">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight uppercase">Training Complete</p>
              <div className="flex gap-6 mt-2 font-bold text-sm text-emerald-100 uppercase tracking-widest">
                <span>Accuracy: <span className="text-white">{(result.accuracy * 100).toFixed(1)}%</span></span>
                <span>Learned Categories: <span className="text-white">{result.labels?.length || 0}</span></span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
