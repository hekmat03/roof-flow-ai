import React from 'react';
import { Loader2 } from 'lucide-react';

interface BusyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
}

export const BusyButton: React.FC<BusyButtonProps> = ({
  busy,
  children,
  disabled,
  className = '',
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || busy}
    className={`${className} inline-flex items-center justify-center gap-2 disabled:opacity-60`}
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : null}
    <span>{children}</span>
  </button>
);
