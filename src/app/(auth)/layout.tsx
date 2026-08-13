export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // Card sits on --color-muted rather than the page's own --color-bg, so it
    // reads as a surface instead of dissolving into the background.
    <main className="grid min-h-dvh place-items-center bg-(--color-muted) px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-bg) shadow-sm">
        {/* Same masthead as the invitation email (see lib/email/templates):
            logo, letterspaced wordmark, accent rule. Someone arriving from
            "Accept invitation" should recognise where they landed. */}
        <div className="flex flex-col items-center border-b-2 border-(--color-accent) px-6 pt-8 pb-5">
          <span className="nlc-logo h-14 w-14" role="img" aria-label="NLC Burgdorf" />
          <span className="font-display mt-3 text-base tracking-[0.28em] text-(--color-accent) uppercase">
            WorshipCenter
          </span>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </main>
  );
}
