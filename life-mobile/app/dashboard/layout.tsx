'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem('camera505_user');
    if (!user) {
      router.replace('/login');
    }
  }, [router]);

  return <AppShell>{children}</AppShell>;
}
