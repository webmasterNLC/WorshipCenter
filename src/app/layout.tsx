import type { Metadata } from 'next';
import './globals.css';
import { body, notoSans, notoSansTamil, display } from './fonts';

export const metadata: Metadata = {
  title: 'NLC Burgdorf SongDrop',
  description: 'Worship songs, chords, and programs for NLC Burgdorf.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVars = `${body.variable} ${notoSans.variable} ${notoSansTamil.variable} ${display.variable}`;
  return (
    <html lang="en" suppressHydrationWarning className={fontVars}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
