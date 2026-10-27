import React from 'react';
import { PricingPlans } from './PricingPlans';
import { BillingAccount } from './BillingAccount';
import { useApp } from '../context/AppContext';
import { PLAN_CATALOG } from '../lib/planAccess';
import { paymentsActivated } from '../lib/lemonCheckout';
import type { BillingStatus } from '../lib/billingApi';

export const BillingGateway: React.FC<{ view: string }> = ({ view }) => {
  const { user, plan, chatsUsed, chatsLimit, tenant, refreshTenant } = useApp();

  const status: BillingStatus = {
    paymentsActivated: paymentsActivated(),
    authenticated: Boolean(user),
    user: user ? { id: user.id, email: user.email ?? '' } : null,
    plan,
    subscription: {
      status: 'none',
      currentPeriodStart: tenant?.chatsPeriodStart ?? null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      hasCustomer: false,
      hasPrice: paymentsActivated(),
    },
    usage: {
      used: chatsUsed,
      limit: chatsLimit,
      remaining: Math.max(chatsLimit - chatsUsed, 0),
      periodStart: tenant?.chatsPeriodStart ?? new Date().toISOString().slice(0, 10),
      periodEnd: 'the 1st of next month',
      storage: 'ok',
    },
    plans: PLAN_CATALOG.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthlyUsd: p.priceMonthlyUsd,
      conversationsPerMonth: p.conversationsPerMonth,
      tagline: p.tagline,
      includes: p.includes,
      capabilities: {},
      priceIdConfigured: paymentsActivated(),
    })),
    notIncluded: [
      'Phone calls — Agent 2 is an interactive simulation until a telephony provider is connected',
      'SMS and email sending — Agent 3 sequences are simulated in-app',
    ],
  };

  return view === 'billing' ? (
    <BillingAccount status={status} onChanged={() => void refreshTenant()} />
  ) : (
    <PricingPlans status={status} onChanged={() => void refreshTenant()} />
  );
};

export default BillingGateway;
