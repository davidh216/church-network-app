'use client';

import { useEffect } from 'react';

const TOAST_TIMEOUT_MS = 6000;

interface ErrorToastProps {
  /** The message; nothing renders while it is empty. */
  message: string;
  /** Called on Dismiss and after TOAST_TIMEOUT_MS. */
  onDismiss: () => void;
}

/** A red alert in the bottom-right corner that dismisses itself after a few seconds. */
export default function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 flex items-start gap-3 max-w-sm rounded-md bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-white hover:underline"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
