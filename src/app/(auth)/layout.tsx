export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-(--color-border) bg-(--color-muted) p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
