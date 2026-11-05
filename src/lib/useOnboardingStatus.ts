import { useCallback, useEffect, useState } from 'react';
import { isOnboardingComplete } from './onboarding';

export type OnboardingStatus = 'checking' | 'needed' | 'done';

// Per-user cache (only to avoid a loading flash). The database is the source of truth.
// Without a signed-in user (demo build with no Supabase) the old global key is used.
const keyFor = (userId: string | null) =>
  userId ? `onboarding_complete:${userId}` : 'onboarding_complete';

const readCache = (key: string): boolean => {
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
};
const writeCache = (key: string): void => {
  try { localStorage.setItem(key, 'true'); } catch { /* storage blocked */ }
};

export function useOnboardingStatus(userId: string | null, configured: boolean) {
  const key = keyFor(userId);
  const [status, setStatus] = useState<OnboardingStatus>(() =>
    readCache(key) ? 'done' : configured ? 'checking' : 'needed',
  );

  useEffect(() => {
    if (status !== 'checking' || !userId) return;
    let cancelled = false;
    void isOnboardingComplete(userId).then((complete) => {
      if (cancelled) return;
      if (complete === false) { setStatus('needed'); return; }
      if (complete === true) writeCache(key);
      setStatus('done'); // null = could not check: never lock the user out of the app
    });
    return () => { cancelled = true; };
  }, [status, userId, key]);

  const markComplete = useCallback(() => {
    writeCache(key);
    setStatus('done');
  }, [key]);

  return { status, markComplete };
}
