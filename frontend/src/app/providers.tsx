'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeQueryClient } from '@/lib/queries/client';
import QueryCacheReset from '@/lib/queries/QueryCacheReset';

export default function Providers({ children }: { children: React.ReactNode }) {
  // One client per tab, created on first render and kept for the tab's lifetime.
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <QueryCacheReset />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
