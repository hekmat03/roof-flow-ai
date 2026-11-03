
export function FullScreenSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center text-ink-soft" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 rounded-full border-4 border-line border-t-gold animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
