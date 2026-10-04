'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import { safeNextPath } from '@/lib/auth/paths';

function LoginPageContent() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  return (
    <LoginForm
      onSuccess={() => router.replace(next)}
      onSwitchToRegister={() => router.push('/register')}
    />
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <Suspense fallback={null}>
        <LoginPageContent />
      </Suspense>
    </div>
  );
}
