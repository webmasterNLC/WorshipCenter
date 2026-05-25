import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { body, notoSans, notoSansTamil, display } from './fonts';

export const metadata: Metadata = {
  title: 'NLC Burgdorf SongDrop',
  description: 'Worship songs, chords, and programs for NLC Burgdorf.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'SongDrop',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVars = `${body.variable} ${notoSans.variable} ${notoSansTamil.variable} ${display.variable}`;
  return (
    <html lang="en" suppressHydrationWarning className={fontVars}>
      <body className="min-h-dvh">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
