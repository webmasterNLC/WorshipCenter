import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NLC Burgdorf SongDrop',
  description: 'Worship songs, chords, and setlists for NLC Burgdorf.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
