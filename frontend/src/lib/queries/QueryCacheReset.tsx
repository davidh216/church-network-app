'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';

/**
 * Clears every cached query when the signed-in user changes (sign-out, or another account
 * signing in on the same tab), so one user's data is never shown to the next.
 */
export default function QueryCacheReset() {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id ?? null;
  const previous = useRef(userId);
  useEffect(() => {
    // Signing in from no user needs nothing: a sign-out already cleared the cache.
    if (previous.current !== null && previous.current !== userId) queryClient.clear();
    previous.current = userId;
  }, [userId, queryClient]);
  return null;
}
