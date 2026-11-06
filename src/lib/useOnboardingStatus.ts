import { useCallback, useEffect, useState } from 'react';
import { isOnboardingComplete } from './onboarding';

export type OnboardingStatus = 'checking' | 'needed' | 'done';

// The company-info wizard is asked ONCE PER ACCOUNT, never per browser.
// Source of truth: contractor_profiles.onboarding_complete in the database, so a
// new device, a cleared browser or a re-login never asks again.
// The localStorage flag below is only a per-user cache that avoids a loading flash.
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

  // The result is remembered WITH the account it belongs to. If another account
  // signs in within the same tab, the old answer is ignored and the new account
  // is evaluated on its own (one person's "done" can never skip or trigger
  // another person's wizard).
  const [result, setResult] = useState<{ key: string; status: OnboardingStatus } | null>(null);

  const status: OnboardingStatus =
    result && result.key === key
      ? result.status
      : readCache(key)
        ? 'done'
        : configured
          ? 'checking'
          : 'needed';

  useEffect(() => {
    if (status !== 'checking' || !userId) return;
    let cancelled = false;
    void isOnboardingComplete(userId).then((complete) => {
      if (cancelled) return;
      if (complete === false) { setResult({ key, status: 'needed' }); return; }
      if (complete === true) writeCache(key);
      // null = could not check: never lock the user out of the app, and never re-ask.
      setResult({ key, status: 'done' });
    });
    return () => { cancelled = true; };
  }, [status, userId, key]);

  // Called by the wizard only AFTER the database save succeeded.
  const markComplete = useCallback(() => {
    writeCache(key);
    setResult({ key, status: 'done' });
  }, [key]);

  return { status, markComplete };
}
