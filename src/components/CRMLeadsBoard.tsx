import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Lead } from '../context/AppContext';
import {
  Users,
  Search,
  Plus,
  MessageSquare,
  Calendar,
  X,
  Phone,
  Mail,
  Home,
  MapPin,
  Trash2,
  FileText,
} from 'lucide-react';

type Status = Lead['status'];

// One list for the filter, the row dropdown and the add form.
const STATUSES: Status[] = [
  'New Lead',
  'Contacted',
  'In Contact',
  'Inspection Scheduled',
  'Inspection Completed',
  'Estimate Sent',
  'Closed-Won',
  'Closed-Lost',
  'Follow-up Nurture',
  'Closed',
];

const STATUS_STYLE: Record<Status, string> = {
  'New Lead': 'st-new',
  'Contacted': 'st-contacted',
  'In Contact': 'st-incontact',
  'Inspection Scheduled': 'st-scheduled',
  'Inspection Completed': 'st-inspected',
  'Estimate Sent': 'st-estimate',
  'Closed-Won': 'st-won',
  'Closed-Lost': 'st-lost',
  'Follow-up Nurture': 'st-nurture',
  'Closed': 'st-closed',
};

const BLANK_FORM = {
  name: '',
  phone: '',
  email: '',
  zip: '',
  issue: '',
  status: 'New Lead' as Status,
  ownership: 'Owner' as Lead['propertyOwnership'],
  source: 'Chatbot' as Lead['agentType'],
  apptDate: '',
  apptTime: '',
  apptNotes: '',
};

const initials = (name: string) =>
  name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

const nowStamp = () => new Date().toLocaleString();

// Date + time of a booked inspection, if there is one.
const inspectionOf = (l: Lead): { date: string; time: string } | null => {
  if (l.status !== 'Inspection Scheduled') return null;
  if (l.appointmentDetails) return { date: l.appointmentDetails.date, time: l.appointmentDetails.time };
  if (l.scheduledDate) {
    const [date, ...rest] = l.scheduledDate.split(' ');
    return { date, time: rest.join(' ') };
  }
  return null;
};

export const CRMLeadsBoard: React.FC = () => {
  const { leads, setLeads, addLead } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = leads.find(l => l.id === selectedId) ?? null;

  // Add-lead form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const setField = <K extends keyof typeof BLANK_FORM>(key: K, value: (typeof BLANK_FORM)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // Inspection editor in the side panel
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptNotes, setApptNotes] = useState('');

  const q = search.trim().toLowerCase();
  const filteredLeads = leads.filter(l => {
    const matchesSearch =
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.phone.includes(search.trim()) ||
      l.email.toLowerCase().includes(q) ||
      l.zipCode.includes(search.trim()) ||
      l.roofIssue.toLowerCase().includes(q);
    return matchesSearch && (statusFilter === 'All' || l.status === statusFilter);
  });

  // Only offer statuses that have leads (plus the active filter), so the list stays short.
  const counts = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: leads.filter(l => l.status === s).length }),
    {} as Record<Status, number>,
  );

  const closePanel = () => {
    setSelectedId(null);
    setIsSchedulingOpen(false);
  };

  const handleStatusChange = (leadId: string, status: Status) => {
    setLeads(prev =>
      prev.map(lead => {
        if (lead.id !== leadId) return lead;
        const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const needsDefaultSlot = status === 'Inspection Scheduled' && !lead.scheduledDate;
        return {
          ...lead,
          status,
          chatLog: [
            ...lead.chatLog,
            { sender: 'System', text: `Status changed to "${status}"`, timestamp: nowStamp() },
          ],
          scheduledDate: needsDefaultSlot ? `${inThreeDays} 10:00 AM` : lead.scheduledDate,
          appointmentDetails:
            status === 'Inspection Scheduled' && !lead.appointmentDetails
              ? { date: inThreeDays, time: '10:00 AM', notes: 'Scheduled manually during status change.' }
              : lead.appointmentDetails,
        };
      }),
    );
  };

  const handleDeleteLead = (leadId: string) => {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    setLeads(prev => prev.filter(l => l.id !== leadId));
    if (selectedId === leadId) closePanel();
  };

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      alert('Please fill in Name and Phone.');
      return;
    }
    const booked = form.status === 'Inspection Scheduled' && form.apptDate;
    const details = booked
      ? {
          date: form.apptDate,
          time: form.apptTime || '02:00 PM',
          notes: form.apptNotes || 'Scheduled during manual lead creation.',
        }
      : undefined;

    addLead({
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || 'N/A',
      propertyOwnership: form.ownership,
      status: form.status,
      agentType: form.source,
      zipCode: form.zip.trim() || '75201',
      roofIssue: form.issue.trim() || 'Storm damage assessment',
      chatLog: [{ sender: 'System', text: 'Lead added manually.', timestamp: nowStamp() }],
      appointmentDetails: details,
      scheduledDate: details ? `${details.date} ${details.time}` : undefined,
    });

    setForm(BLANK_FORM);
    setIsAddOpen(false);
  };

  const startScheduling = (lead: Lead) => {
    const current = inspectionOf(lead);
    setApptDate(current?.date || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setApptTime(current?.time || '10:00 AM');
    setApptNotes(lead.appointmentDetails?.notes || '');
    setIsSchedulingOpen(true);
  };

  const handleSaveAppointment = (leadId: string) => {
    if (!apptDate || !apptTime) {
      alert('Date and time are required to schedule an inspection.');
      return;
    }
    setLeads(prev =>
      prev.map(lead =>
        lead.id !== leadId
          ? lead
          : {
              ...lead,
              status: 'Inspection Scheduled',
              scheduledDate: `${apptDate} ${apptTime}`,
              appointmentDetails: { ...lead.appointmentDetails, date: apptDate, time: apptTime, notes: apptNotes },
              chatLog: [
                ...lead.chatLog,
                {
                  sender: 'System',
                  text: `Inspection set for ${apptDate} at ${apptTime}.${apptNotes ? ` Notes: ${apptNotes}` : ''}`,
                  timestamp: nowStamp(),
                },
              ],
            },
      ),
    );
    setIsSchedulingOpen(false);
  };

  const selectedInspection = selected ? inspectionOf(selected) : null;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">CRM Leads Board</h2>
          <p className="text-xs text-slate-400 mt-1">Every lead your agents capture, with its full conversation.</p>
        </div>
        <button
          onClick={() => setIsAddOpen(o => !o)}
          className="btn-accent px-4 py-2.5 text-sm flex items-center gap-2 shrink-0"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          Add lead
        </button>
      </div>

      {/* Add lead */}
      {isAddOpen && (
        <form onSubmit={handleCreateLead} className="glass rounded-2xl p-5 max-w-3xl animate-slideDown space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">New lead</h3>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input required className="input-premium" placeholder="Full name *" value={form.name} onChange={e => setField('name', e.target.value)} />
            <input required type="tel" className="input-premium" placeholder="Phone *" value={form.phone} onChange={e => setField('phone', e.target.value)} />
            <input type="email" className="input-premium" placeholder="Email" value={form.email} onChange={e => setField('email', e.target.value)} />
            <input className="input-premium" placeholder="Zip code" value={form.zip} onChange={e => setField('zip', e.target.value)} />
            <input className="input-premium sm:col-span-2" placeholder="Roof issue (e.g. storm damage, leak)" value={form.issue} onChange={e => setField('issue', e.target.value)} />
            <select className="input-premium" value={form.status} onChange={e => setField('status', e.target.value as Status)} aria-label="Status">
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {form.status === 'Inspection Scheduled' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <input type="date" required className="input-premium-sm" value={form.apptDate} onChange={e => setField('apptDate', e.target.value)} />
              <input required className="input-premium-sm" placeholder="Time, e.g. 10:00 AM" value={form.apptTime} onChange={e => setField('apptTime', e.target.value)} />
              <textarea rows={2} className="input-premium-sm sm:col-span-2" placeholder="Notes (optional)" value={form.apptNotes} onChange={e => setField('apptNotes', e.target.value)} />
            </div>
          )}

          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer hover:text-slate-200 select-none">More details</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <select className="input-premium" value={form.ownership} onChange={e => setField('ownership', e.target.value as Lead['propertyOwnership'])} aria-label="Ownership">
                <option value="Owner">Property owner</option>
                <option value="Renter">Renter / tenant</option>
              </select>
              <select className="input-premium" value={form.source} onChange={e => setField('source', e.target.value as Lead['agentType'])} aria-label="Source">
                <option value="Chatbot">Source: Website chatbot</option>
                <option value="Phone Call">Source: Phone call</option>
                <option value="SMS Nurture">Source: SMS / email</option>
                <option value="Estimate Follow-Up">Source: Estimate follow-up</option>
              </select>
            </div>
          </details>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
            <button type="submit" className="btn-accent px-5 py-2 text-sm">Save lead</button>
          </div>
        </form>
      )}

      {/* Toolbar + table */}
      <div className="glass rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-3 h-5 w-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search name, phone, zip or issue"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-premium pl-11"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'All' | Status)}
            className="input-premium sm:w-56"
            aria-label="Filter by status"
          >
            <option value="All">All statuses ({leads.length})</option>
            {STATUSES.filter(s => counts[s] > 0 || s === statusFilter).map(s => (
              <option key={s} value={s}>{s} ({counts[s]})</option>
            ))}
          </select>
          {leads.length > 0 && (
            <span className="text-xs text-slate-500 sm:ml-auto whitespace-nowrap">
              {filteredLeads.length} of {leads.length}
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/20 premium-scroll table-sticky-header">
          <table className="w-full border-collapse text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/85 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5">Lead</th>
                <th className="px-5 py-3.5">Issue</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Inspection</th>
                <th className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 row-stripe bg-slate-900/10">
              {filteredLeads.map(lead => {
                const slot = inspectionOf(lead);
                return (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-800/40 transition cursor-pointer"
                    onClick={() => setSelectedId(lead.id)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-accent-300 shrink-0">
                          {initials(lead.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-white truncate">{lead.name}</p>
                          <p className="text-xs text-slate-500">{lead.phone}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <p className="text-xs text-slate-200 line-clamp-1 max-w-[16rem]">{lead.roofIssue}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{lead.zipCode}</p>
                    </td>

                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <select
                        value={lead.status}
                        onChange={e => handleStatusChange(lead.id, e.target.value as Status)}
                        className={`status-pill cursor-pointer ${STATUS_STYLE[lead.status]}`}
                        aria-label={`Status for ${lead.name}`}
                      >
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>

                    <td className="px-5 py-3.5 text-xs">
                      {slot ? (
                        <span className="inline-flex items-center gap-1.5 text-accent-400 font-mono">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {slot.date} {slot.time}
                        </span>
                      ) : lead.status === 'Inspection Completed' ? (
                        <span className="text-slate-300">Completed</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedId(lead.id)}
                          className="text-accent-400 hover:bg-accent-500/10 font-semibold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 min-h-0"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Open
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
                          title="Delete lead"
                          aria-label={`Delete ${lead.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    {leads.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                        <div className="h-11 w-11 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                          <Users className="h-5 w-5 text-slate-500" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-300">No leads yet</h4>
                        <p className="text-xs text-slate-500">
                          Leads your chatbot captures appear here. Try Agent 1 from the menu.
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No leads match your search.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead panel */}
      {selected && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-end animate-fadeIn" onClick={closePanel}>
          <div
            className="w-full max-w-xl glass-strong border-l border-slate-800/80 h-full flex flex-col shadow-2xl animate-slideLeft"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-orange-500 shrink-0">
                  {initials(selected.name)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-white truncate">{selected.name}</h3>
                  <p className="text-xs text-slate-400">via {selected.agentType}</p>
                </div>
              </div>
              <button
                onClick={closePanel}
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800 border border-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Details */}
            <div className="p-5 border-b border-slate-800 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs text-slate-300">
              <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-500" />{selected.phone}</p>
              <p className="flex items-center gap-2 min-w-0"><Mail className="h-3.5 w-3.5 text-slate-500 shrink-0" /><span className="truncate">{selected.email}</span></p>
              <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-500" />{selected.zipCode}</p>
              <p className="flex items-center gap-2"><Home className="h-3.5 w-3.5 text-slate-500" />{selected.propertyOwnership}</p>
              <p className="flex items-start gap-2 col-span-2"><FileText className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />{selected.roofIssue}</p>
            </div>

            {/* Inspection */}
            <div className="p-5 border-b border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Inspection</h4>
                {isSchedulingOpen ? (
                  <button onClick={() => setIsSchedulingOpen(false)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                ) : (
                  <button
                    onClick={() => startScheduling(selected)}
                    className="text-xs font-bold text-accent-400 hover:text-accent-300"
                  >
                    {selectedInspection ? 'Reschedule' : 'Schedule'}
                  </button>
                )}
              </div>

              {isSchedulingOpen ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="input-premium-sm" />
                    <input value={apptTime} onChange={e => setApptTime(e.target.value)} placeholder="10:00 AM" className="input-premium-sm" />
                  </div>
                  <textarea
                    rows={2}
                    value={apptNotes}
                    onChange={e => setApptNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="input-premium-sm"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSaveAppointment(selected.id)}
                      className="bg-accent-500 hover:bg-accent-400 text-slate-950 text-xs font-black px-4 py-2 rounded-lg transition"
                    >
                      Save inspection
                    </button>
                  </div>
                </div>
              ) : selectedInspection ? (
                <div className="text-xs space-y-1.5">
                  <p className="font-mono text-white">{selectedInspection.date} · {selectedInspection.time}</p>
                  {selected.appointmentDetails?.notes && (
                    <p className="text-slate-400 italic">{selected.appointmentDetails.notes}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No inspection booked.</p>
              )}
            </div>

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-950/50 premium-scroll">
              {selected.chatLog.map((log, index) => {
                if (log.sender === 'System') {
                  return (
                    <div key={index} className="flex justify-center">
                      <span className="text-[10px] text-slate-500 text-center max-w-md">
                        {log.timestamp} · {log.text}
                      </span>
                    </div>
                  );
                }
                const isAI = log.sender === 'AI';
                return (
                  <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-md rounded-2xl px-4 py-3 text-xs leading-relaxed ${isAI ? 'chat-bubble-ai rounded-tl-none' : 'chat-bubble-user rounded-tr-none'}`}>
                      <div className="flex justify-between items-center gap-4 mb-1 opacity-60">
                        <span className="text-[10px] font-black uppercase tracking-wider">{isAI ? 'AI agent' : 'Homeowner'}</span>
                        <span className="text-[9px] font-mono">{log.timestamp}</span>
                      </div>
                      <p className="whitespace-pre-line">{log.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
