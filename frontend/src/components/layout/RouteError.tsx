'use client';

import Link from 'next/link';

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
}

/** Body of the route groups' error.tsx: what went wrong, a retry and a way out. */
export default function RouteError({
  error,
  reset,
  homeHref = '/',
  homeLabel = 'Go to the dashboard',
}: RouteErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="text-lg font-medium text-gray-900">Something went wrong</h2>
      <p className="mt-1 text-sm text-gray-600">
        {error.message || 'This page could not be displayed.'}
      </p>
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          Try again
        </button>
        <Link href={homeHref} className="text-blue-600 font-medium">
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
