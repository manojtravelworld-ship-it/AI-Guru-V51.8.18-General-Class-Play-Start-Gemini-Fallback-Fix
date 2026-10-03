import type { Metadata } from 'next';
import './globals.css';
import ServiceWorkerRepair from '../components/pwa/ServiceWorkerRepair';

export const metadata: Metadata = {
  title: 'AI Guru V49',
  description: 'AI Guru V49 — universal branch-aware visual mathematics classroom',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Self-hosted Chilanka (Malayalam handwriting) from Google Fonts / SMC — offline-safe */}
        <link rel="stylesheet" href="/fonts/chilanka/chilanka.css" />
        {/* CDN fallback if local file missing */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chilanka&display=swap"
        />
      </head>
      <body style={{ fontFamily: 'Chilanka, "Noto Sans Malayalam", "Nirmala UI", "Noto Sans", sans-serif' }}>
        <ServiceWorkerRepair />
        {children}
      </body>
    </html>
  );
}
