import React, { useCallback, useEffect, useState } from 'react';
import { AgentHeader } from './AgentHeader';
import { useApp } from '../context/AppContext';
import { getAgentResponse, type AgentMessage } from '../lib/agentService';
import { cancelEstimateFollowup, fetchFollowupStatus, queueFollowups, type FollowupStatus } from '../lib/followupsApi';

export const Agent4Estimate: React.FC = () => {
  const { companySettings, leads } = useApp();
  const [followupStatus, setFollowupStatus] = useState<FollowupStatus | null>(null);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const estimateLeads = leads.filter(lead => lead.status === 'Estimate Sent');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setFollowupStatus(await fetchFollowupStatus()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load follow-up status.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const messagesFor = (leadId: string) => followupStatus?.messages.filter(message => message.lead_id === leadId && message.sequence_key?.startsWith('estimate:')) ?? [];
  const isOptedIn = (leadId: string) => messagesFor(leadId).some(message => message.status === 'pending' || message.status === 'sending');

  const toggleFollowup = async (leadId: string) => {
    if (busyLeadId) return;
    setBusyLeadId(leadId); setError(null);
    try {
      if (isOptedIn(leadId)) await cancelEstimateFollowup(leadId);
      else await queueFollowups('estimate', leadId);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the estimate follow-up.'); }
    finally { setBusyLeadId(null); }
  };

  const sendTestMessage = async () => {
    const text = input.trim();
    if (!text || chatBusy) return;
    const next: AgentMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setChatBusy(true); setError(null);
    try {
      const response = await getAgentResponse('closer', next, {
        companyName: companySettings.companyName,
        city: companySettings.city,
        stormEvent: companySettings.stormName,
        stormDate: companySettings.stormDate,
        financingOptions: companySettings.financingOptions,
        agentTone: companySettings.agentTone,
      });
      setMessages([...next, { role: 'assistant', content: response }]);
    } catch (err) { setError(err instanceof Error ? err.message : 'The agent could not respond.'); }
    finally { setChatBusy(false); }
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <AgentHeader
        title="Estimate follow-up"
        description="When a lead reaches Estimate Sent, switch on one follow-up email so no estimate goes quiet."
      />

      <section className="card card-pad" aria-label="Estimate follow-up leads">
        <h2 className="card-title mb-3">Leads with estimates sent</h2>
        {followupStatus && !followupStatus.configured && <p className="mb-2 text-xs text-amber-300">Email is not configured; no follow-up email will be sent.</p>}
        {estimateLeads.length === 0 ? <p className="text-xs text-ink-mute">No leads are currently in Estimate Sent.</p> : <ul className="divide-y divide-line/70">{estimateLeads.map(lead => {
          const followups = messagesFor(lead.id);
          const status = followups.find(message => message.status === 'pending' || message.status === 'sending' || message.status === 'sent')?.status
            ?? followups.at(-1)?.status
            ?? 'not scheduled';
          const canSchedule = Boolean(lead.email && lead.email !== 'N/A' && followupStatus?.businessAddressReady && followupStatus?.configured);
          return <li key={lead.id} className="grid grid-cols-1 items-center gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:gap-4">
            <span className="min-w-0"><span className="font-semibold text-ink">{lead.name}</span><span className="ml-2 text-ink-mute">{lead.email || 'No email'}</span></span>
            <span className="capitalize text-ink-soft">{status}</span>
            <label className="flex items-center gap-2 text-ink-soft">
              <input type="checkbox" checked={isOptedIn(lead.id)} onChange={() => void toggleFollowup(lead.id)} disabled={!canSchedule || busyLeadId !== null} />
              Schedule follow-up email
            </label>
            {!followupStatus?.businessAddressReady && <span className="text-orange-300 sm:col-span-3">Add your business mailing address in Configuration to send follow-ups.</span>}
          </li>;
        })}</ul>}
        {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      </section>

      <details className="card card-pad">
        <summary className="card-title cursor-pointer">Test the agent</summary>
        <p className="mt-2 text-sm text-ink-mute">Try a homeowner question. This test chat does not create or update CRM leads.</p>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {messages.map((message, index) => <p key={index} className={`rounded-lg p-3 text-sm ${message.role === 'assistant' ? 'bg-inset text-ink' : 'ml-8 bg-accent-500/10 text-ink-soft'}`}>{message.content}</p>)}
        </div>
        <form onSubmit={event => { event.preventDefault(); void sendTestMessage(); }} className="mt-3 flex gap-2">
          <input value={input} onChange={event => setInput(event.target.value)} disabled={chatBusy} placeholder="Ask a homeowner question" className="input-premium text-sm" />
          <button type="submit" disabled={chatBusy || !input.trim()} className="btn-accent px-3 py-2 text-xs disabled:opacity-40">{chatBusy ? 'Thinking…' : 'Send'}</button>
        </form>
      </details>
    </div>
  );
};
