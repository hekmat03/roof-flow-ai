import React from 'react';

/**
 * Title block shared by every AI-agent page. It mirrors the Dashboard header
 * (same type size, spacing and muted description) so all pages feel like one app.
 */
export const AgentHeader: React.FC<{
  title: string;
  description: string;
  /** Optional status badge(s) shown on the right on wide screens. */
  aside?: React.ReactNode;
}> = ({ title, description, aside }) => (
  <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-mute">{description}</p>
    </div>
    {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
  </header>
);
