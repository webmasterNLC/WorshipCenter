import type { Metadata } from 'next';
import './globals.css';
import { inter, notoSans, notoSansTamil, fraunces } from './fonts';

export const metadata: Metadata = {
  title: 'NLC Burgdorf SongDrop',
  description: 'Worship songs, chords, and setlists for NLC Burgdorf.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVars = `${inter.variable} ${notoSans.variable} ${notoSansTamil.variable} ${fraunces.variable}`;
  return (
    <html lang="en" suppressHydrationWarning className={fontVars}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
