// src/pages/BotDetail/tabs/Analytics.jsx
import React, { useState, useEffect } from 'react';
import { useApi } from '../../../hooks/useApi';
import { getAnalytics } from '../../../api/client';
import Spinner from '../../../components/Spinner';
import ErrorBanner from '../../../components/ErrorBanner';

export default function Analytics({ botId }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  
  const { loading, error, call, clearError } = useApi();

  useEffect(() => {
    fetchData();
  }, [botId, days]);

  const fetchData = async () => {
    try {
      const result = await call(getAnalytics, botId, days);
      setData(result);
    } catch (err) {}
  };

  if (loading && !data) return <Spinner />;

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-gray-900 tracking-tight">Performance Analytics</h3>
          <p className="text-gray-500 font-medium">Tracking usage, efficiency, and intelligence metrics.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-white border border-gray-200 text-sm font-bold px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
        >
          <option value={7}>Last 7 Days</option>
          <option value={30}>Last 30 Days</option>
          <option value={90}>Last 90 Days</option>
        </select>
      </div>

      <ErrorBanner message={error} onDismiss={clearError} />

      {data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Total Queries" value={data.totals.total_queries} icon="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" color="blue" />
            <StatCard label="Cache Hits" value={data.totals.total_cache_hits} icon="M13 10V3L4 14h7v7l9-11h-7z" color="amber" />
            <StatCard label="Intent Hits" value={data.totals.total_intent_hits} icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" color="purple" />
            <StatCard label="RAG Hits" value={data.totals.total_rag_hits} icon="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" color="emerald" />
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <h4 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2 uppercase tracking-tight">
              Intelligence Efficiency
            </h4>
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100" />
                  <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" 
                    strokeDasharray={440} 
                    strokeDashoffset={440 - (440 * (data.totals.cache_hit_rate / 100))}
                    className="text-blue-500 transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-black text-gray-900">{(data.totals.cache_hit_rate).toFixed(0)}%</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cache Rate</span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                  <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Impact</p>
                  <p className="text-blue-900 font-medium text-sm leading-tight">
                    By serving <span className="font-bold underline">{(data.totals.cache_hit_rate).toFixed(1)}%</span> of queries from cache, you have significantly reduced LLM latency and costs.
                  </p>
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50">
                  <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-1">Precision</p>
                  <p className="text-emerald-900 font-medium text-sm leading-tight">
                    RAG and Intent systems are currently handling <span className="font-bold underline">{data.totals.total_rag_hits + data.totals.total_intent_hits}</span> specialized queries.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between">
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Daily Breakdown</h4>
              <span className="text-[10px] font-bold text-gray-400">Showing {data.daily.length} active days</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase font-black tracking-widest text-gray-500">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Total Queries</th>
                    <th className="px-6 py-4">Cache Hits</th>
                    <th className="px-6 py-4">Intent Hits</th>
                    <th className="px-6 py-4">RAG Hits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-medium text-sm">
                  {data.daily.map((day, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                      <td className="px-6 py-4 text-gray-900 font-bold">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td className="px-6 py-4">{day.query_count}</td>
                      <td className="px-6 py-4 text-amber-600">{day.cache_hits}</td>
                      <td className="px-6 py-4 text-purple-600">{day.intent_hits}</td>
                      <td className="px-6 py-4 text-blue-600">{day.rag_hits}</td>
                    </tr>
                  ))}
                  {data.daily.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-20 text-center text-gray-400 font-medium italic">
                        No activity recorded during this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="py-20 text-center text-gray-400 font-medium italic">
          Start chatting with your bot to generate usage data.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const colors = {
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    purple: 'text-purple-600 bg-purple-50 border-purple-100',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100'
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${colors[color]}`}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
        </svg>
      </div>
      <p className="text-3xl font-black text-gray-900 tracking-tight">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}
