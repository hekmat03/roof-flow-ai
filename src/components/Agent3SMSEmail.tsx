import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { cancelFollowup, fetchFollowupStatus, queueFollowups, sendTestEmail, type FollowupMessage, type FollowupStatus } from '../lib/followupsApi';
import { makeFollowupEmailTemplates, type FollowupDay, type FollowupEmailDraft } from '../lib/followupTemplates';

const DAYS: FollowupDay[] = [1, 2, 4, 7];

export const Agent3SMSEmail: React.FC = () => {
  const { companySettings, leads, setActiveTab } = useApp();
  const emailLeads = useMemo(() => leads.filter(lead => lead.email && lead.email !== 'N/A' && /\S+@\S+\.\S+/.test(lead.email)), [leads]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const activeLeadId = emailLeads.some(lead => lead.id === selectedLeadId) ? selectedLeadId : emailLeads[0]?.id || '';
  const selectedLead = emailLeads.find(lead => lead.id === activeLeadId);
  const [selectedDay, setSelectedDay] = useState<FollowupDay>(1);
  const [drafts, setDrafts] = useState<Partial<Record<FollowupDay, FollowupEmailDraft>>>({});
  const [followupStatus, setFollowupStatus] = useState<FollowupStatus | null>(null);
  const [queue, setQueue] = useState<FollowupMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const baseTemplates = useMemo(
    () => makeFollowupEmailTemplates(selectedLead?.name || '', companySettings.companyName, companySettings.city),
    [selectedLead?.name, companySettings.companyName, companySettings.city],
  );

  const refreshQueue = useCallback(async () => {
    try {
      const result = await fetchFollowupStatus();
      setFollowupStatus(result);
      setQueue(result.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load email follow-ups.');
    }
  }, []);
  useEffect(() => { void refreshQueue(); }, [refreshQueue]);

  const draftFor = (day: FollowupDay) => drafts[day] ?? baseTemplates[day];
  const updateDraft = (day: FollowupDay, key: keyof FollowupEmailDraft, value: string) => {
    setDrafts(previous => ({
      ...previous,
      [day]: { ...(previous[day] ?? baseTemplates[day]), [key]: value },
    }));
  };

  const startSequence = async () => {
    if (!selectedLead || !followupStatus?.businessAddressReady || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const emails = DAYS.map(step => ({ step, ...draftFor(step) }));
      const result = await queueFollowups('sequence', selectedLead.id, emails);
      await refreshQueue();
      if (result.recordedOnly) setNotice('Email is not configured; the follow-up was recorded only and no messages were scheduled.');
      else setNotice(`Email sequence scheduled for ${selectedLead.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the email sequence.');
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true); setError(null); setNotice(null);
    try { await sendTestEmail(); setNotice('Test email sent to your contractor profile email.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Test email could not be sent.'); }
    finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    setBusy(true); setError(null);
    try { await cancelFollowup(id); await refreshQueue(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel the email.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">Agent 3: Email follow-ups</h1>
        <span className="text-xs text-ink-mute">SMS follow-ups: coming soon.</span>
      </header>

      {followupStatus && !followupStatus.configured && <p role="status" className="text-xs text-amber-300">Email delivery is not configured. No emails will be sent until the email provider is set up.</p>}

      <section className="glass rounded-xl p-4 space-y-3" aria-label="Email sequence setup">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1 text-xs text-ink-soft">CRM lead with email
            <select value={activeLeadId} onChange={event => setSelectedLeadId(event.target.value)} className="input-premium mt-1 text-sm" disabled={!emailLeads.length}>
              {emailLeads.length ? emailLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.name} — {lead.email}</option>) : <option value="">No leads with an email yet</option>}
            </select>
          </label>
          <button type="button" onClick={sendTest} disabled={busy || !followupStatus?.configured} className="btn-ghost px-3 py-2 text-xs disabled:opacity-40">Send test email to myself</button>
        </div>

        {selectedLead ? <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Email follow-up day">
            {DAYS.map(day => <button key={day} type="button" role="tab" aria-selected={selectedDay === day} onClick={() => setSelectedDay(day)} className={`rounded-lg px-3 py-1.5 text-xs ${selectedDay === day ? 'bg-accent-500/20 text-accent-300' : 'bg-card text-ink-mute'}`}>Day {day}</button>)}
          </div>
          <label className="block text-xs text-ink-soft">Subject
            <input value={draftFor(selectedDay).subject} onChange={event => updateDraft(selectedDay, 'subject', event.target.value)} maxLength={180} className="input-premium mt-1 text-sm" />
          </label>
          <label className="block text-xs text-ink-soft">Email text
            <textarea value={draftFor(selectedDay).body} onChange={event => updateDraft(selectedDay, 'body', event.target.value)} maxLength={5000} rows={4} className="input-premium mt-1 text-sm" />
          </label>
          <div className="rounded-lg bg-inset/60 p-3" aria-label="Email preview">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-mute">Email preview</p>
            <p className="whitespace-pre-wrap text-xs text-ink-soft">{draftFor(selectedDay).body}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void startSequence()} disabled={busy || !followupStatus?.businessAddressReady || !followupStatus?.configured} className="btn-accent px-4 py-2 text-xs disabled:opacity-40">{busy ? 'Please wait…' : 'Start sequence'}</button>
            {!followupStatus?.businessAddressReady && <p role="status" className="text-xs text-orange-300">Add your business mailing address to send email follow-ups. <button type="button" onClick={() => setActiveTab('config')} className="underline font-bold">Open Configuration</button></p>}
          </div>
        </> : <p className="text-xs text-ink-mute">No leads with an email yet. Capture a lead in Agent 1 or add one in the CRM.</p>}

        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        {notice && <p role="status" className="text-xs text-ink-soft">{notice}</p>}
      </section>

      <section className="glass rounded-xl p-4" aria-label="Email follow-up queue">
        <h2 className="mb-2 text-sm font-semibold text-ink">Email queue</h2>
        {queue.filter(message => message.sequence_key?.startsWith('nurture:')).length === 0 ? <p className="text-xs text-ink-mute">No follow-up emails in the queue.</p> : <ul className="divide-y divide-line/70">{queue.filter(message => message.sequence_key?.startsWith('nurture:')).map(message => (
          <li key={message.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
            <span className="text-ink-soft">Day {message.step ?? '—'} · {message.to_email} · {new Date(message.send_at).toLocaleString()}</span>
            <span className="flex items-center gap-2"><span className="text-ink-mute capitalize">{message.status}</span>{message.status === 'pending' && <button type="button" disabled={busy} onClick={() => void cancel(message.id)} className="text-accent-300 underline">Cancel</button>}</span>
          </li>
        ))}</ul>}
      </section>
    </div>
  );
};
