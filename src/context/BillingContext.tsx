import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchBillingStatus, type BillingStatus } from '../lib/billingApi';
import type { PlanId } from '../lib/planAccess';
import { LIMIT_EVENT, type LimitDetail } from '../lib/limitEvents';
import { useAuth } from './AuthContext';
import { useApp } from './AppContext';

export type ReturnFlag = 'success' | 'cancelled' | 'portal' | null;

interface BillingContextType {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  plan: PlanId;
  reload: () => void;
  upgradeOpen: boolean;
  upgradeReason: string | null;
  openUpgrade: (reason?: string) => void;
  closeUpgrade: () => void;
  returnFlag: ReturnFlag;
  clearReturnFlag: () => void;
}

const BillingContext = createContext<BillingContextType | undefined>(undefined);

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { setActiveTab } = useApp();
  const userId = user?.id ?? null;

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  const [returnFlag, setReturnFlag] = useState<ReturnFlag>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setStatus(await fetchBillingStatus());
      setError(null);
    } catch {
      setError('Could not reach the billing service. Plan and usage are unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => { void load(); }, [load]);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  useEffect(() => {
    const onLimit = (e: Event) => {
      const d = (e as CustomEvent<LimitDetail>).detail;
      void load(true);
      if (d?.code === 'limit_reached' || d?.code === 'upgrade_required') {
        setUpgradeReason(d.message ?? null);
        setUpgradeOpen(true);
      }
    };
    window.addEventListener(LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(LIMIT_EVENT, onLimit);
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('billing');
    if (flag !== 'success' && flag !== 'cancelled' && flag !== 'portal') return;
    setReturnFlag(flag);
    setActiveTab('billing');
    params.delete('billing');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [setActiveTab]);

  useEffect(() => {
    if (returnFlag !== 'success') return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      void load(true);
      if (n >= 10) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [returnFlag, load]);

  const value = useMemo<BillingContextType>(() => ({
    status,
    loading,
    error,
    plan: status?.plan ?? 'free',
    reload,
    upgradeOpen,
    upgradeReason,
    openUpgrade: (reason?: string) => {
      setUpgradeReason(reason ?? null);
      setUpgradeOpen(true);
    },
    closeUpgrade: () => setUpgradeOpen(false),
    returnFlag,
    clearReturnFlag: () => setReturnFlag(null),
  }), [status, loading, error, reload, upgradeOpen, upgradeReason, returnFlag]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
};

export const useBilling = (): BillingContextType => {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used within a BillingProvider');
  return ctx;
};
