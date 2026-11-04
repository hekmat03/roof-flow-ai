import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCalendarStatus, startCalendarConnection, type CalendarStatus } from '../lib/calendarApi';

/** Compact "Connect Google Calendar" control shown in the sidebar. */
export const CalendarConnection: React.FC = () => {
  const { session } = useAuth();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setStatus(await getCalendarStatus(session.access_token));
    } catch (cause) {
      // Show the server's own reason (for example "Calendar status is temporarily unavailable").
      setError(cause instanceof Error && cause.message ? cause.message : 'Calendar status is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Back from Google: /app?calendar=connected | error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('calendar');
    if (!result) return;
    if (result === 'error') setError('Google Calendar could not be connected. Please try again.');
    params.delete('calendar');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

  async function connect() {
    if (!session?.access_token) return setError('Sign in again before connecting Google Calendar.');
    setConnecting(true);
    setError(null);
    try {
      const { url } = await startCalendarConnection(session.access_token);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google Calendar could not be connected.');
      setConnecting(false);
    }
  }

  return (
    <div className="text-xs">
      {loading ? (
        <span className="flex items-center gap-2 text-slate-400" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking calendar…
        </span>
      ) : status?.connected ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-500">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Calendar connected
          </span>
          <span className="min-w-0 flex-1 truncate text-slate-400" title={status.email ?? ''}>{status.email}</span>
          <button type="button" onClick={() => void refresh()} aria-label="Refresh calendar status" className="min-h-0 text-slate-400 hover:text-white">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting || status?.configured === false}
          title={status?.configured === false ? 'Google OAuth is not set up on the server yet.' : undefined}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2 font-semibold text-slate-200 transition hover:border-[#F97316] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
          {connecting ? 'Connecting…' : 'Connect Google Calendar'}
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-rose-400">{error}</p>}
      {!loading && status && !status.configured && !error && (
        <p className="mt-2 text-slate-500">Calendar booking turns on once Google OAuth is set up.</p>
      )}
    </div>
  );
};
