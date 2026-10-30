import { useEffect } from 'react';
import { navigate } from '../lib/router';

export function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, true);
  }, [to]);

  return null;
}
