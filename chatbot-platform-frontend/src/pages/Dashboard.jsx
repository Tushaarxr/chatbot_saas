// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listBots } from '../api/client';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';

export default function Dashboard() {
  const [bots, setBots] = useState([]);
  const { loading, error, call, clearError } = useApi();

  useEffect(() => {
    const fetchBots = async () => {
      try {
        const data = await call(listBots);
        setBots(data.bots || []);
      } catch (err) {
        // Error handled by useApi
      }
    };
    fetchBots();
  }, []);

  const getBadgeStyles = (type) => {
    switch (type) {
      case 'intent': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'rag': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'persona_rag': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading && bots.length === 0) return <Spinner />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Your Bots</h2>
          <p className="text-gray-500 font-medium mt-1">Manage and deploy your intelligent agents</p>
        </div>
        <Link
          to="/bots/new"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 hover:-translate-y-0.5"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Create New Bot
        </Link>
      </div>

      <ErrorBanner message={error} onDismiss={clearError} />

      {bots.length === 0 && !loading ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-20 text-center shadow-sm">
          <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No bots yet</h3>
          <p className="text-gray-500 max-w-xs mx-auto mb-8 font-medium">
            Start by creating your first chatbot to automate your workflows.
          </p>
          <Link
            to="/bots/new"
            className="text-blue-600 font-bold hover:text-blue-700 transition-colors inline-flex items-center gap-1"
          >
            Get started now
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bots.map((bot) => (
            <Link
              key={bot.id}
              to={`/bots/${bot.id}`}
              className="group bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-2xl hover:shadow-blue-500/5 hover:border-blue-100 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className={`text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full border ${getBadgeStyles(bot.bot_type)}`}>
                    {bot.bot_type.replace('_', ' ')}
                  </div>
                  <div className="text-gray-300 group-hover:text-blue-400 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {bot.name}
                </h4>
                <p className="text-gray-500 text-sm line-clamp-2 font-medium mb-4">
                  {bot.system_prompt || "No system prompt defined."}
                </p>
              </div>
              <div className="pt-4 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400 font-medium">
                <span>Created {new Date(bot.created_at).toLocaleDateString()}</span>
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${bot.is_active ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                  {bot.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
