'use client';

import RouteError from '@/components/layout/RouteError';

export default function AuthError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} homeHref="/login" homeLabel="Back to sign in" />;
}
