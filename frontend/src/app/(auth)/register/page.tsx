'use client';

import { useRouter } from 'next/navigation';
import RegisterForm from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  const router = useRouter();
  return <RegisterForm onSwitchToLogin={() => router.push('/login')} />;
}
