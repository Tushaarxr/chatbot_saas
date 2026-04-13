// src/pages/CreateBot.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { createBot } from '../api/client';
import ErrorBanner from '../components/ErrorBanner';

export default function CreateBot() {
  const [formData, setFormData] = useState({
    name: '',
    bot_type: 'rag',
    persona_name: '',
    persona_prompt: '',
    system_prompt: ''
  });
  
  const { loading, error, call, clearError } = useApi();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await call(createBot, formData);
      // Store API key temporarily for BotDetail to show once
      sessionStorage.setItem(`new_bot_api_key_${data.id}`, data.api_key);
      navigate(`/bots/${data.id}`);
    } catch (err) {
      // Error handled by useApi
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <Link to="/" className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 mb-4 group text-sm">
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">Configure Your New Bot</h2>
        <p className="text-gray-500 font-medium mt-2">Define the intelligence and behavior of your agent.</p>
      </div>

      <ErrorBanner message={error} onDismiss={clearError} />

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 space-y-8">
        <div className="space-y-6">
          <div>
            <label className="text-sm font-bold text-gray-700 block mb-2 uppercase tracking-wider">Bot Name</label>
            <input
              name="name"
              type="text"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium"
              placeholder="e.g. Sales Support Pro"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="text-sm font-bold text-gray-700 block mb-2 uppercase tracking-wider">Bot Engine / Type</label>
            <select
              name="bot_type"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium appearance-none bg-no-repeat bg-[right_1rem_center] bg-[length:1em_1em]"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")` }}
              value={formData.bot_type}
              onChange={handleChange}
            >
              <option value="intent">Intent-based Classifier (Small/Fast)</option>
              <option value="rag">Neural Search / RAG (Document Knowledge)</option>
              <option value="persona_rag">Persona Neural Search (Creative RAG)</option>
            </select>
          </div>

          {formData.bot_type === 'persona_rag' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2 uppercase tracking-wider">Persona Name</label>
                <input
                  name="persona_name"
                  type="text"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                  placeholder="e.g. Aria"
                  value={formData.persona_name}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 block mb-2 uppercase tracking-wider">Persona Prompt</label>
                <textarea
                  name="persona_prompt"
                  required
                  rows="4"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                  placeholder="Describe how the persona should act, talk, and behave..."
                  value={formData.persona_prompt}
                  onChange={handleChange}
                ></textarea>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-bold text-gray-700 block mb-2 uppercase tracking-wider">Base System Prompt (Optional)</label>
            <textarea
              name="system_prompt"
              rows="3"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              placeholder="Core instructions for the underlying LLM..."
              value={formData.system_prompt}
              onChange={handleChange}
            ></textarea>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 text-white font-bold rounded-2xl transition-all duration-300 flex justify-center items-center gap-2 ${
              loading 
                ? 'bg-blue-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 hover:-translate-y-1'
            }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating Bot...
              </>
            ) : 'Assemble Bot Interface'}
          </button>
        </div>
      </form>
    </div>
  );
}
