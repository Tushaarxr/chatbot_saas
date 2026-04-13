import { useState, useCallback } from 'react';

/**
 * Generic hook to wrap any API call with loading and error states.
 */
export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(async (apiFn, ...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFn(...args);
      return result;
    } catch (err) {
      const msg = err.message || "An unexpected error occurred";
      setError(msg);
      throw err; // Re-throw so the component can handle it if needed
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, call, clearError };
}
