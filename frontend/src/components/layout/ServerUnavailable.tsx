'use client';

import { useState } from 'react';

/** The API could not be reached (network error, 5xx): offer a retry rather than a sign-in link. */
export default function ServerUnavailable({ onRetry }: { onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div role="alert" className="text-center">
        <p className="text-gray-900 font-medium">The server is unavailable</p>
        <p className="mt-1 text-sm text-gray-600">Please try again in a moment.</p>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {retrying ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    </div>
  );
}
