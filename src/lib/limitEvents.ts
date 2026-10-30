/** Fired when the server says the plan limit was hit (or a feature needs an upgrade). */
export const LIMIT_EVENT = 'roofflow:limit';

export interface LimitDetail {
  /** 'limit_reached' | 'upgrade_required' | 'conversation_cap' */
  code: string;
  message?: string;
}

export function notifyLimit(detail: LimitDetail): void {
  try {
    window.dispatchEvent(
      new CustomEvent<LimitDetail>(LIMIT_EVENT, { detail })
    );
  } catch {
    /* best-effort */
  }
}
