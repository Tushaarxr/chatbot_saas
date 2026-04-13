// src/pages/BotDetail/tabs/Overview.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../../hooks/useApi';
import { updateBot, deleteBot } from '../../../api/client';
import ConfirmModal from '../../../components/ConfirmModal';
import ErrorBanner from '../../../components/ErrorBanner';

export default function Overview({ bot, setBot }) {
  const [formData, setFormData] = useState({
    name: bot.name,
    persona_name: bot.persona_name || '',
    persona_prompt: bot.persona_prompt || '',
    system_prompt: bot.system_prompt || ''
  });
  
  const [showDelete, setShowDelete] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const { loading, error, call, clearError } = useApi();
  const navigate = useNavigate();

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const updated = await call(updateBot, bot.id, formData);
      setBot(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      // Error handled by useApi
    }
  };

  const handleDelete = async () => {
    try {
      await call(deleteBot, bot.id);
      navigate("/");
    } catch (err) {
      setShowDelete(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <ErrorBanner message={error} onDismiss={clearError} />

      <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm transition-all focus-within:shadow-md">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-gray-900 tracking-tight">Configuration</h3>
          {saveSuccess && (
            <span className="text-green-600 font-bold text-sm flex items-center gap-1 animate-bounce">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Changes Saved!
            </span>
          )}
        </div>
        
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Bot Name</label>
              <input
                type="text"
                className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            {bot.bot_type === 'persona_rag' && (
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Persona Name</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                  value={formData.persona_name}
                  onChange={(e) => setFormData({ ...formData, persona_name: e.target.value })}
                />
              </div>
            )}
          </div>

          {bot.bot_type === 'persona_rag' && (
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Persona Prompt</label>
              <textarea
                rows="4"
                className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                value={formData.persona_prompt}
                onChange={(e) => setFormData({ ...formData, persona_prompt: e.target.value })}
              ></textarea>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">System Prompt</label>
            <textarea
              rows="3"
              className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
            ></textarea>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={loading}
              className={`px-8 py-3 text-white font-bold rounded-xl transition-all ${
                loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 hover:-translate-y-1'
              }`}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-red-50 rounded-3xl p-8 border border-red-100 shadow-inner">
        <h3 className="text-xl font-black text-red-900 tracking-tight mb-2">Danger Zone</h3>
        <p className="text-red-700 text-sm font-medium mb-6">
          Deleting this bot is permanent. All associated chat history, documents, and analytics will be permanently destroyed.
        </p>
        <button
          onClick={() => setShowDelete(true)}
          className="px-6 py-3 border-2 border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-300"
        >
          Delete Agent
        </button>
      </section>

      {showDelete && (
        <ConfirmModal
          message={`Are you sure you want to delete "${bot.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
