import { useEffect, useRef, useState } from 'react';

/**
 * useCountUp — animates a number from its current value to `target` with an
 * ease-out curve. Re-runs whenever `target` changes, so live CRM updates
 * re-animate naturally. Pure rAF + no external deps.
 *
 * Note: value is tracked via the ref (not the state setter closure) so the
 * component survives React StrictMode's mount→cleanup→mount cycle in dev
 * without snapping to the final number.
 */
export function useCountUp(target: number, duration = 950): number {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = valueRef.current;
    const delta = target - from;
    if (delta === 0) {
      setValue(target);
      valueRef.current = target;
      return;
    }
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = from + delta * eased;
      valueRef.current = next;
      setValue(next);
      if (elapsed < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        valueRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [target, duration]);

  return value;
}
