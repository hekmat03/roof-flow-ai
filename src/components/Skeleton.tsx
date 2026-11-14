
import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    aria-hidden
    className={`animate-pulse motion-reduce:animate-none rounded-md bg-slate-700/40 ${className}`}
  />
);

/** Placeholder for a list of lead rows. */
export const LeadRowsSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div role="status" aria-live="polite" className="space-y-3 py-2">
    <span className="sr-only">Loading your leads…</span>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-700/60 p-3">
        <Skeleton className="h-9 w-9 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    ))}
  </div>
);

/** Placeholder for a card with a few text lines. */
export const CardSkeleton: React.FC<{ lines?: number; label?: string }> = ({
  lines = 3,
  label = 'Loading…',
}) => (
  <div role="status" aria-live="polite" className="glass rounded-2xl p-6 space-y-3">
    <span className="sr-only">{label}</span>
    <Skeleton className="h-5 w-1/4" />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
    ))}
  </div>
);

/** Placeholder for the whole app while the session is checked. */
export const AppShellSkeleton: React.FC = () => (
  <div role="status" aria-live="polite" className="min-h-screen bg-page flex">
    <span className="sr-only">Checking your session…</span>
    <aside className="hidden md:block w-60 border-r border-line p-4 space-y-3">
      <Skeleton className="h-8 w-32" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </aside>
    <main className="flex-1 p-4 md:p-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </main>
  </div>
);
