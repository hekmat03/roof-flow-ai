
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Globe, Inbox, RefreshCw } from 'lucide-react';
import { RealLeadsBoard } from './RealLeadsBoard';

export const LiveLeadsStrip: React.FC = () => {
  return (
    <section className="glass rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent-400" />
            Live Widget Leads
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Real visitors who completed the chat widget on a contractor&rsquo;s website.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-accent-400 hover:text-accent-300 font-bold flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
      <div className="mt-4">
        <RealLeadsBoard />
      </div>
    </section>
  );
};
