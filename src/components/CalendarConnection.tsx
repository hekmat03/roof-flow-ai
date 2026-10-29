import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, LoaderCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCalendarStatus, startCalendarConnection, type CalendarStatus } from '../lib/calendarApi';

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
    setError(null);
    try {
      setStatus(await getCalendarStatus(session.access_token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calendar status is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('calendar');
    if (!result) return;
    if (result === 'error') setError('Google Calendar could not be connected. Check the OAuth setup and try again.');
    if (result === 'connected') void refresh();
    params.delete('calendar');
    const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', next);
  }, [refresh]);

  const connect = async () => {
    if (!session?.access_token) {
      setError('Sign in again before connecting Google Calendar.');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const result = await startCalendarConnection(session.access_token);
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Calendar could not be connected.');
      setConnecting(false);
    }
  };

  return (
    <div className="calendar-connection">
      {loading ? (
        <span className="calendar-connection__status" aria-live="polite">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Checking calendar
        </span>
      ) : status?.connected ? (
        <div className="calendar-connection__connected">
          <span className="calendar-connection__badge">
            <CalendarDays className="h-4 w-4" /> Calendar connected
          </span>
          <span className="calendar-connection__email">{status.email}</span>
          <button type="button" className="calendar-connection__refresh" onClick={() => void refresh()} aria-label="Refresh calendar status">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button type="button" className="calendar-connection__button" onClick={() => void connect()} disabled={connecting}>
          {connecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
          {connecting ? 'Connecting…' : 'Connect Google Calendar'}
        </button>
      )}
      {error && <p className="calendar-connection__error" role="status">{error}</p>}
      {!loading && status && !status.configured && !error && (
        <p className="calendar-connection__error">Add the Google OAuth settings to enable calendar booking.</p>
      )}
    </div>
  );
};
