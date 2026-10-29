export function FullScreenSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-slate-300" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 rounded-full border-4 border-slate-700 border-t-[#F97316] animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
