import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthContext';

export const metadata: Metadata = {
  title: 'CAMERA 505 — Sleep Intelligence Platform',
  description: 'Multimodal Sleep Intelligence & Cardiorespiratory Monitoring',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* JetBrains Mono also imported via globals.css @import — link here speeds up first paint */}
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#000000', color: '#FFFFFF', minHeight: '100vh', fontFamily: "'JetBrains Mono', 'Geist Mono', 'IBM Plex Mono', ui-monospace, monospace" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
