// src/components/Spinner.jsx
import React from 'react';

/**
 * Simple centered loading spinner.
 */
export default function Spinner() {
  return (
    <div className="flex justify-center items-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );
}
