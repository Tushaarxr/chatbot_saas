import React from 'react';
import ChatPanel from '../../../components/ChatPanel';

/**
 * Playground Tab — A dedicated space for testing bot interactions.
 */
export default function Playground({ botId, bot, apiKey }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h3 className="text-2xl font-black text-gray-900 tracking-tight">Test Lab</h3>
          <p className="text-gray-500 font-medium mt-1">
            Interact with your bot in real-time to verify its responses, intent classification, and RAG accuracy.
          </p>
        </div>

        {/* We reuse the ChatPanel component but give it more space here */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <ChatPanel 
             botId={botId} 
             botType={bot?.bot_type} 
             apiKey={apiKey} 
             embedded={true}
          />
        </div>
        
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-1">Live Training</h4>
            <p className="text-xs text-gray-500 font-medium">Changes made in the Intents or Documents tabs are reflected here instantly.</p>
          </div>
          
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-4">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-1">Source Tracing</h4>
            <p className="text-xs text-gray-500 font-medium">Identify if answers are coming from the Intent Map, RAG database, or Cache.</p>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-4">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h4 className="font-bold text-gray-900 mb-1">Session Isolation</h4>
            <p className="text-xs text-gray-500 font-medium">Testing in the Lab uses a unique session to avoid polluting your production analytics.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
