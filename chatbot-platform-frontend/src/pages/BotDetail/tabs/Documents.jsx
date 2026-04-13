// src/pages/BotDetail/tabs/Documents.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useApi } from '../../../hooks/useApi';
import { uploadDocumentSafe as uploadDocument, listDocuments, deleteDocument } from '../../../api/client';
import Spinner from '../../../components/Spinner';
import ErrorBanner from '../../../components/ErrorBanner';
import ConfirmModal from '../../../components/ConfirmModal';

export default function Documents({ botId, bot, apiKey }) {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [result, setResult] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);
  
  const { loading, error, call, clearError } = useApi();

  const fetchDocuments = async () => {
    try {
      const data = await call(listDocuments, botId);
      setDocuments(data.documents || []);
    } catch (err) {
      // Handled
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [botId, call]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.size > 20 * 1024 * 1024) {
      alert("File exceeds 20MB limit");
      setFile(null);
      return;
    }
    setFile(selected);
    setResult(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    try {
      const data = await call(uploadDocument, botId, file, description);
      setResult(data);
      setFile(null);
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDocuments(); // Refresh list after upload
    } catch (err) {
      // Error handled by useApi
    }
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await call(deleteDocument, botId, showDeleteModal);
      fetchDocuments();
    } catch (err) {
      // Handled
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ErrorBanner message={error} onDismiss={clearError} />

      <section className="bg-white rounded-3xl p-10 border border-gray-100 shadow-sm">
        <h3 className="text-xl font-black text-gray-900 tracking-tight mb-2">Knowledge Base</h3>
        <p className="text-gray-500 font-medium mb-8">Upload documents to provide your RAG bot with technical context.</p>

        <form onSubmit={handleUpload} className="space-y-6">
          <div 
            onClick={() => fileInputRef.current.click()}
            className={`cursor-pointer border-3 border-dashed rounded-3xl p-12 text-center transition-all ${
              file 
                ? 'border-blue-400 bg-blue-50/30' 
                : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.txt"
              className="hidden"
            />
            <div className="flex flex-col items-center">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                file ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              {file ? (
                <div>
                  <p className="text-blue-700 font-bold">{file.name}</p>
                  <p className="text-blue-500 text-xs font-medium mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <>
                  <p className="text-gray-900 font-bold">Select PDF or TXT to Upload</p>
                  <p className="text-gray-400 text-sm font-medium mt-1">Drag and drop or click to browse</p>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Short Description</label>
            <input
              type="text"
              className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              placeholder="e.g. Sales Playbook 2024"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={!file || loading}
            className={`w-full py-4 text-white font-bold rounded-2xl transition-all flex justify-center items-center gap-2 ${
              !file || loading 
                ? 'bg-blue-300 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100'
            }`}
          >
            {loading ? <Spinner /> : 'Upload & Index Knowledge'}
          </button>
        </form>
      </section>

    {result && (
        <section className="bg-emerald-50 border border-emerald-100 rounded-3xl p-8 animate-in zoom-in-95 duration-300">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-600 text-white p-2 rounded-full shadow-lg shadow-emerald-200">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-emerald-900 font-black text-lg">Knowledge Baselined</p>
              <p className="text-emerald-700 font-medium tracking-tight">
                Indexed <span className="font-bold underline">{result.chunks_indexed}</span> chunks from <span className="font-bold">"{result.filename}"</span>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Document List View */}
      <section className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm mt-8">
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-xl font-black text-gray-900">Uploaded Documents</h3>
            <p className="text-sm font-medium text-gray-500 mt-1">Manage active knowledge sources</p>
          </div>
          <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-200 shadow-sm">
            {documents.length} Files
          </div>
        </div>
        
        {documents.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-medium bg-gray-50/30">
            No documents uploaded yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <li key={doc.id} className="p-6 sm:px-8 hover:bg-blue-50/30 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="bg-blue-100 text-blue-600 p-3 rounded-xl shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{doc.filename}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
                        {doc.file_size_kb} KB
                      </span>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                        {doc.chunk_count} Chunks
                      </span>
                      <span className="text-xs font-medium text-gray-400 pl-1 border-l border-gray-200">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                    {doc.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2 bg-gray-50/80 p-2 rounded-lg border border-gray-100">{doc.description}</p>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={() => setShowDeleteModal(doc.id)}
                  className="bg-white border-2 border-red-100 text-red-600 p-2.5 rounded-xl hover:bg-red-600 hover:text-white hover:border-red-600 transition-all focus:ring-4 focus:ring-red-100 shrink-0 self-end sm:self-auto shadow-sm"
                  title="Delete Document"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      
      <ConfirmModal
        isOpen={!!showDeleteModal}
        title="Delete Document?"
        message="This document and all its indexed chunks will be permanently removed from the bot's knowledge base. Are you sure?"
        confirmLabel={isDeleting ? "Deleting..." : "Delete Knowledge"}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(null)}
        danger={true}
      />
    </div>
  );
}
