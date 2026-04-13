// src/pages/NotFound.jsx
import React from 'react';
import { Link } from 'react-router-dom';

/**
 * 404 fallback page.
 */
export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-8 animate-in fade-in zoom-in-95 duration-700">
      <div className="relative mb-12">
        <div className="text-[180px] font-black text-gray-100 leading-none select-none">404</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl shadow-blue-400/50 animate-bounce">
            <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
      
      <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-4">Lost in hyperspace?</h2>
      <p className="text-gray-500 font-medium max-w-sm mx-auto mb-10 leading-relaxed">
        The page you are looking for doesn't exist or has been moved to another dimension.
      </p>
      
      <Link 
        to="/" 
        className="px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
