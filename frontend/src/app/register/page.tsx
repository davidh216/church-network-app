'use client';

import { useRouter } from 'next/navigation';
import RegisterForm from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <RegisterForm onSwitchToLogin={() => router.push('/login')} />
    </div>
  );
}
