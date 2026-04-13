// src/components/ConfirmModal.jsx
import React from 'react';

/**
 * Reusable "Are you sure?" dialog — used for delete actions.
 */
export default function ConfirmModal({ 
  isOpen = true,
  title = "Confirm Action",
  message, 
  onConfirm, 
  onCancel, 
  confirmLabel = "Delete", 
  danger = true 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl transform transition-all animate-in fade-in zoom-in duration-200">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition-colors font-medium ${
              danger 
                ? 'bg-red-600 hover:bg-red-700 shadow-md shadow-red-200' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
