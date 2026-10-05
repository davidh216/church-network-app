'use client';

import { getErrorMessage } from '@/lib/errors';

interface InlineErrorProps {
  error: unknown;
  /** Used when the error carries no message. */
  fallback: string;
  onRetry?: () => void;
  className?: string;
}

/** A failed query or action: its message and, when the caller can retry, a Retry button. */
export default function InlineError({
  error,
  fallback,
  onRetry,
  className = '',
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={`px-4 py-3 bg-red-50 border-l-4 border-red-400 text-sm text-red-700 ${className}`}
    >
      {getErrorMessage(error, fallback)}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-3 font-medium underline">
          Retry
        </button>
      )}
    </div>
  );
}
