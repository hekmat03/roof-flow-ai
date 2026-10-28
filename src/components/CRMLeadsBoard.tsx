import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Lead } from '../context/AppContext';
import { RealLeadsBoard } from './RealLeadsBoard';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  MessageSquare, 
  Calendar, 
  X, 
  User, 
  Phone, 
  Mail, 
  Home, 
  Clock, 
  ShieldCheck,
  CheckCircle2,
  Trash2,
  MapPin,
  FileText
} from 'lucide-react';

export const CRMLeadsBoard: React.FC = () => {
  const { leads, setLeads, addLead } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedLeadForChat, setSelectedLeadForChat] = useState<Lead | null>(null);
  
  // Form State for Adding New Lead
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newOwnership, setNewOwnership] = useState<'Owner' | 'Renter'>('Owner');
  const [newStatus, setNewStatus] = useState<Lead['status']>('New Lead');
  const [newAgentType, setNewAgentType] = useState<Lead['agentType']>('Chatbot');
  const [newZipCode, setNewZipCode] = useState('75201');
  const [newRoofIssue, setNewRoofIssue] = useState('Storm damage assessment');
  
  // New Lead inline scheduling fields
  const [newApptDate, setNewApptDate] = useState('');
  const [newApptTime, setNewApptTime] = useState('');
  const [newApptNotes, setNewApptNotes] = useState('');

  // Edit fields for selected lead's appointment inside the slide-over panel
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false);
  const [editApptDate, setEditApptDate] = useState('');
  const [editApptTime, setEditApptTime] = useState('');
  const [editApptNotes, setEditApptNotes] = useState('');

  // Status style helper — maps the 10 CRM statuses to premium pill tokens
  const getStatusStyles = (status: Lead['status']) => {
    switch (status) {
      case 'New Lead': return 'st-new';
      case 'Contacted': return 'st-contacted';
      case 'In Contact': return 'st-incontact';
      case 'Inspection Scheduled': return 'st-scheduled';
      case 'Inspection Completed': return 'st-inspected';
      case 'Estimate Sent': return 'st-estimate';
      case 'Closed-Won': return 'st-won';
      case 'Closed-Lost': return 'st-lost';
      case 'Follow-up Nurture': return 'st-nurture';
      case 'Closed':
      default:
        return 'st-closed';
    }
  };

  // Search & Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.zipCode.includes(searchTerm) ||
      lead.roofIssue.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = (leadId: string, newStatus: Lead['status']) => {
    setLeads(prev => prev.map(lead => {
      if (lead.id === leadId) {
        const updatedChat = [...lead.chatLog];
        updatedChat.push({
          sender: 'System',
          text: `Lead status updated manually to "${newStatus}"`,
          timestamp: new Date().toLocaleString()
        });
        
        // Auto schedule in 3 days if scheduled but no details
        const defaultSchedDate = newStatus === 'Inspection Scheduled' && !lead.scheduledDate 
          ? new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0] + ' 10:00 AM'
          : lead.scheduledDate;

        const defaultApptDetails = newStatus === 'Inspection Scheduled' && !lead.appointmentDetails
          ? {
              date: new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0],
              time: '10:00 AM',
              notes: 'Scheduled manually during status change.'
            }
          : lead.appointmentDetails;

        const updatedLead = {
          ...lead,
          status: newStatus,
          chatLog: updatedChat,
          scheduledDate: defaultSchedDate,
          appointmentDetails: defaultApptDetails
        };

        // If active lead in slide-over, update slide-over state too
        if (selectedLeadForChat && selectedLeadForChat.id === leadId) {
          setSelectedLeadForChat(updatedLead);
        }

        return updatedLead;
      }
      return lead;
    }));
  };

  const handleDeleteLead = (leadId: string) => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      setLeads(prev => prev.filter(l => l.id !== leadId));
      if (selectedLeadForChat?.id === leadId) {
        setSelectedLeadForChat(null);
      }
    }
  };

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) {
      alert('Please fill in Name and Phone.');
      return;
    }

    const emailVal = newEmail || 'N/A';
    const apptDetailsObj = newStatus === 'Inspection Scheduled' && newApptDate
      ? {
          date: newApptDate,
          time: newApptTime || '02:00 PM',
          notes: newApptNotes || 'Scheduled during manual lead creation.'
        }
      : undefined;

    const schedDateStr = apptDetailsObj 
      ? `${apptDetailsObj.date} ${apptDetailsObj.time}`
      : undefined;

    addLead({
      name: newName,
      phone: newPhone,
      email: emailVal,
      propertyOwnership: newOwnership,
      status: newStatus,
      agentType: newAgentType,
      zipCode: newZipCode || '75201',
      roofIssue: newRoofIssue || 'Storm damage assessment',
      chatLog: [
        { sender: 'System', text: `Lead manually added to CRM Board. Source: ${newAgentType}`, timestamp: new Date().toLocaleString() }
      ],
      appointmentDetails: apptDetailsObj,
      scheduledDate: schedDateStr
    });

    // Reset Form
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewOwnership('Owner');
    setNewStatus('New Lead');
    setNewAgentType('Chatbot');
    setNewZipCode('75201');
    setNewRoofIssue('Storm damage assessment');
    setNewApptDate('');
    setNewApptTime('');
    setNewApptNotes('');
    setIsAddOpen(false);
  };

  // Open scheduling editor in slide-over
  const startScheduling = (lead: Lead) => {
    setEditApptDate(lead.appointmentDetails?.date || new Date(Date.now() + 2*24*60*60*1000).toISOString().split('T')[0]);
    setEditApptTime(lead.appointmentDetails?.time || '10:00 AM');
    setEditApptNotes(lead.appointmentDetails?.notes || '');
    setIsSchedulingOpen(true);
  };

  // Save rescheduled or new appointment details inside the slide-over panel
  const handleSaveAppointment = (leadId: string) => {
    if (!editApptDate || !editApptTime) {
      alert('Date and Time are required to schedule an inspection.');
      return;
    }

    setLeads(prev => prev.map(lead => {
      if (lead.id === leadId) {
        const updatedChat = [...lead.chatLog];
        updatedChat.push({
          sender: 'System',
          text: `Inspection scheduled/rescheduled manually to ${editApptDate} at ${editApptTime}. Notes: ${editApptNotes || 'None'}`,
          timestamp: new Date().toLocaleString()
        });

        const updatedLead: Lead = {
          ...lead,
          status: 'Inspection Scheduled',
          scheduledDate: `${editApptDate} ${editApptTime}`,
          appointmentDetails: {
            date: editApptDate,
            time: editApptTime,
            notes: editApptNotes
          },
          chatLog: updatedChat
        };

        // Update active slide-over view immediately
        setSelectedLeadForChat(updatedLead);
        return updatedLead;
      }
      return lead;
    }));

    setIsSchedulingOpen(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-ink">CRM Leads Board</h2>
          <p className="text-xs text-ink-mute mt-1">Manage and track all captured roofing lead interactions, inspection bookings, and conversations.</p>
        </div>
        
        <button
          onClick={() => setIsAddOpen(!isAddOpen)}
          className="btn-accent px-4 py-2.5 text-sm flex items-center gap-2 self-start"
        >
          <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
          Add Manual Lead
        </button>
      </div>

      {/* LIVE leads captured by the embeddable website widget (server-side). */}
      <RealLeadsBoard />

      {/* Manual Add Form (Collapsible Card) */}
      {isAddOpen && (
        <form onSubmit={handleCreateLead} className="glass-card p-6 shadow-xl max-w-3xl animate-slideDown">
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-line">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Plus className="h-4 w-4 text-accent-500" /> Create New Lead Profile
            </h3>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-ink-mute hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Full Name *</label>
              <input
                type="text"
                required
                placeholder="Sarah Connor"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="input-premium"
              />
            </div>
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Phone Number *</label>
              <input
                type="tel"
                required
                placeholder="(214) 555-0100"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                className="input-premium"
              />
            </div>
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Email Address</label>
              <input
                type="email"
                placeholder="s.connor@sky.net (or leave empty)"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="input-premium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Property Ownership</label>
              <select
                value={newOwnership}
                onChange={e => setNewOwnership(e.target.value as 'Owner' | 'Renter')}
                className="input-premium"
              >
                <option value="Owner">Property Owner</option>
                <option value="Renter">Renter / Tenant</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Initial Status</label>
              <select
                value={newStatus}
                onChange={e => setNewStatus(e.target.value as Lead['status'])}
                className="input-premium"
              >
                <option value="New Lead">New Lead</option>
                <option value="Contacted">Contacted</option>
                <option value="In Contact">In Contact</option>
                <option value="Inspection Scheduled">Inspection Scheduled</option>
                <option value="Inspection Completed">Inspection Completed</option>
                <option value="Estimate Sent">Estimate Sent</option>
                <option value="Closed-Won">Closed-Won</option>
                <option value="Closed-Lost">Closed-Lost</option>
                <option value="Follow-up Nurture">Follow-up Nurture</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Acquisition Source</label>
              <select
                value={newAgentType}
                onChange={e => setNewAgentType(e.target.value as Lead['agentType'])}
                className="input-premium"
              >
                <option value="Chatbot">Agent 1: Website Chatbot</option>
                <option value="Phone Call">Agent 2: Phone Call Handler</option>
                <option value="SMS Nurture">Agent 3: SMS/Email Nurture</option>
                <option value="Estimate Follow-Up">Agent 4: Estimate Follow-Up</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-line pt-4">
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Zip Code</label>
              <input
                type="text"
                placeholder="75201"
                value={newZipCode}
                onChange={e => setNewZipCode(e.target.value)}
                className="input-premium"
              />
            </div>
            <div>
              <label className="text-xs text-ink-mute block mb-2 font-semibold">Roof Issue Description</label>
              <input
                type="text"
                placeholder="Storm damage replacement estimate, leak assessment, etc."
                value={newRoofIssue}
                onChange={e => setNewRoofIssue(e.target.value)}
                className="input-premium"
              />
            </div>
          </div>

          {/* Inline Scheduling options when status is Inspection Scheduled */}
          {newStatus === 'Inspection Scheduled' && (
            <div className="mt-4 p-4 rounded-xl bg-[#0f172a] border border-accent-500/10 space-y-4">
              <h4 className="text-xs font-bold uppercase text-accent-400 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Schedule Initial Appointment Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-ink-mute block mb-1 font-semibold">Appointment Date *</label>
                  <input
                    type="date"
                    required
                    value={newApptDate}
                    onChange={e => setNewApptDate(e.target.value)}
                    className="w-full input-premium-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-ink-mute block mb-1 font-semibold">Appointment Time (e.g. 10:00 AM) *</label>
                  <input
                    type="text"
                    required
                    placeholder="10:00 AM"
                    value={newApptTime}
                    onChange={e => setNewApptTime(e.target.value)}
                    className="w-full input-premium-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-ink-mute block mb-1 font-semibold">Scheduler Notes (Internal/Customer preferences)</label>
                <textarea
                  placeholder="E.g., visible water stains on second floor ceiling, prefers afternoon visit."
                  value={newApptNotes}
                  onChange={e => setNewApptNotes(e.target.value)}
                  rows={2}
                  className="w-full input-premium-sm"
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="btn-ghost px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-accent px-5 py-2 text-sm"
            >
              Save Lead to Database
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Dashboard Card */}
      <div className="glass-card card-hover rounded-2xl p-5 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-3 h-5 w-5 text-ink-mute" />
            <input
              type="text"
              placeholder="Search by name, phone, email, zip or issue..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input-premium pl-11"
            />
          </div>

          {/* Quick Filter tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 lg:pb-0 scrollbar-none">
            <Filter className="h-4 w-4 text-ink-mute mr-1 shrink-0" />
            {['All', 'New Lead', 'Contacted', 'In Contact', 'Inspection Scheduled', 'Inspection Completed', 'Estimate Sent', 'Closed-Won', 'Closed-Lost', 'Follow-up Nurture', 'Closed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-accent-500/15 text-accent-400 border border-accent-500/20'
                    : 'bg-inset border border-line text-ink-mute hover:text-ink'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Leads Table Container */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-ink">Simulator leads</h3>
            <span className="label-micro rounded px-2 py-0.5 border text-ink-mute bg-inset border-line">
              SIMULATED · demo data
            </span>
            <span className="text-xs text-ink-mute">
              — created by the agent simulators, stored in this browser only (fully editable).
            </span>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-inset premium-scroll table-sticky-header">
          <table className="w-full border-collapse text-left text-sm text-ink-soft">
            <thead>
              <tr className="border-b border-line bg-inset text-xs font-semibold uppercase tracking-widest text-ink-mute">
                <th className="px-6 py-4">Homeowner Name</th>
                <th className="px-6 py-4">Roof Issue / Zip</th>
                <th className="px-6 py-4">Acquisition Source</th>
                <th className="px-6 py-4">Workflow Status</th>
                <th className="px-6 py-4">Scheduled Inspection</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line row-stripe bg-inset">
              {filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    className="hover:bg-inset transition cursor-pointer"
                    onClick={() => setSelectedLeadForChat(lead)}
                  >
                    {/* Homeowner Name & Contact info */}
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center space-x-3">
                        <div 
                          className="h-9 w-9 rounded-xl surface-inset flex items-center justify-center font-bold text-accent-300 shadow-lg cursor-pointer"
                          onClick={() => setSelectedLeadForChat(lead)}
                        >
                          {lead.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="cursor-pointer" onClick={() => setSelectedLeadForChat(lead)}>
                          <p className="font-bold text-ink">{lead.name}</p>
                          <span className="inline-block mt-1 label-micro rounded px-1.5 py-0.5 border text-ink-mute bg-inset border-line">
                            SIMULATED · demo data
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-ink-mute mt-0.5">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    {/* Roof Issue and Zip Code */}
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        <p className="text-xs text-ink-soft font-medium line-clamp-1 max-w-xs">{lead.roofIssue}</p>
                        <p className="text-[10px] text-ink-mute flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> Zip: {lead.zipCode}</p>
                      </div>
                    </td>

                    {/* Agent source */}
                    <td className="px-6 py-4">
                      <span className="text-xs text-ink-soft bg-inset px-2 py-1 rounded-lg border border-line font-medium">
                        {lead.agentType}
                      </span>
                    </td>

                    {/* Status dropdown selector */}
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <select
                        value={lead.status}
                        onChange={e => handleStatusChange(lead.id, e.target.value as Lead['status'])}
                        className={`status-pill cursor-pointer ${getStatusStyles(lead.status)}`}
                      >
                        <option value="New Lead">New Lead</option>
                        <option value="Contacted">Contacted</option>
                        <option value="In Contact">In Contact</option>
                        <option value="Inspection Scheduled">Inspection Scheduled</option>
                        <option value="Inspection Completed">Inspection Completed</option>
                        <option value="Estimate Sent">Estimate Sent</option>
                        <option value="Closed-Won">Closed-Won</option>
                        <option value="Closed-Lost">Closed-Lost</option>
                        <option value="Follow-up Nurture">Follow-up Nurture</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </td>

                    {/* Scheduled inspection date */}
                    <td className="px-6 py-4">
                      {lead.status === 'Inspection Scheduled' && (lead.appointmentDetails || lead.scheduledDate) ? (
                        <div className="flex items-center space-x-1.5 text-xs text-accent-400">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>{lead.appointmentDetails?.date || lead.scheduledDate?.split(' ')[0]} {lead.appointmentDetails?.time || lead.scheduledDate?.split(' ').slice(1).join(' ')}</span>
                        </div>
                      ) : lead.status === 'Inspection Completed' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-400 px-2 py-0.5 rounded bg-accent-400/5 border border-accent-400/10">
                          <CheckCircle2 className="h-3 w-3" /> Completed
                        </span>
                      ) : (
                        <span className="text-xs text-ink-mute italic">Not Scheduled</span>
                      )}
                    </td>

                    {/* Quick view button actions */}
                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setSelectedLeadForChat(lead)}
                          className="bg-accent-500/10 hover:bg-accent-500 hover:text-gold-ink text-accent-400 font-bold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1 min-h-0"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          View Log ({lead.chatLog.length})
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="text-ink-mute hover:text-danger p-1.5 rounded-lg hover:bg-inset transition"
                          title="Delete Lead"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                      <div className="h-12 w-12 rounded-2xl bg-inset border border-line flex items-center justify-center">
                        <Users className="h-6 w-6 text-ink-mute" />
                      </div>
                      <h4 className="text-sm font-bold text-ink-soft">Your CRM is live and waiting</h4>
                      <p className="text-xs text-ink-mute leading-relaxed">
                        No leads yet. Every lead captured by the AI agents — chat, phone, SMS/email nurture, or estimate follow-up — lands here instantly with its full conversation transcript.
                      </p>
                      <p className="text-[11px] text-ink-mute font-semibold">
                        Start with Agent 1 on the Dashboard → "Simulate Chatbot".
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-ink-mute italic">
                    No leads matching your search criteria were found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Conversation Audit Panel */}
      {selectedLeadForChat && (
        <div className="fixed inset-0 bg-inset backdrop-blur-sm z-50 flex justify-end animate-fadeIn">
          <div className="w-full max-w-2xl glass-card border-l border-line h-full flex flex-col justify-between shadow-2xl animate-slideLeft">
            
            {/* Panel Header */}
            <div className="p-6 border-b border-line bg-inset flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="h-11 w-11 rounded-xl bg-inset border border-line flex items-center justify-center font-bold text-accent-500 text-lg">
                  {selectedLeadForChat.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h3 className="font-extrabold text-ink text-base">{selectedLeadForChat.name}</h3>
                  <p className="text-xs text-ink-mute flex items-center gap-1.5 mt-0.5">
                    <span>Acquired via: <span className="text-accent-400 font-bold">{selectedLeadForChat.agentType}</span></span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedLeadForChat(null); setIsSchedulingOpen(false); }}
                className="text-ink-mute hover:text-ink p-1 rounded-lg bg-inset border border-line"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Homeowner Audit Profile Card */}
            <div className="p-4 bg-inset border-b border-line grid grid-cols-2 gap-4 text-xs text-ink-soft">
              <div className="col-span-2">
                <span className="label-micro rounded px-2 py-0.5 border text-ink-mute bg-inset border-line">
                  SIMULATED · demo data
                </span>
                <span className="ml-2 text-[11px] text-ink-mute">
                  Generated by a simulator and saved in this browser only.
                </span>
              </div>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-ink-mute" /> <span className="font-semibold text-ink">Full Name:</span> {selectedLeadForChat.name}</p>
                <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-mute" /> <span className="font-semibold text-ink">Phone:</span> {selectedLeadForChat.phone}</p>
                <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-ink-mute" /> <span className="font-semibold text-ink">Email:</span> {selectedLeadForChat.email}</p>
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink-mute" /> <span className="font-semibold text-ink">Zip Code:</span> {selectedLeadForChat.zipCode}</p>
              </div>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5"><Home className="h-3.5 w-3.5 text-ink-mute" /> <span className="font-semibold text-ink">Ownership:</span> {selectedLeadForChat.propertyOwnership}</p>
                <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-ink-mute" /> <span className="font-semibold text-ink">Status:</span> 
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusStyles(selectedLeadForChat.status)}`}>
                    {selectedLeadForChat.status}
                  </span>
                </p>
                <p className="flex items-start gap-1.5"><FileText className="h-3.5 w-3.5 text-ink-mute shrink-0 mt-0.5" /> <span><span className="font-semibold text-ink">Roof Issue:</span> {selectedLeadForChat.roofIssue}</span></p>
              </div>
            </div>

            {/* Scheduled Inspection Booking details with edit state */}
            <div className="p-4 bg-inset border-b border-line space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-accent-400" /> Inspection Appointment Panel
                </h4>
                
                {!isSchedulingOpen ? (
                  <button
                    onClick={() => startScheduling(selectedLeadForChat)}
                    className="text-[11px] font-black bg-accent-500 text-gold-ink px-3 py-1 rounded-md hover:bg-accent-400 transition"
                  >
                    {selectedLeadForChat.status === 'Inspection Scheduled' ? 'Reschedule / Edit' : 'Schedule Inspection'}
                  </button>
                ) : (
                  <button
                    onClick={() => setIsSchedulingOpen(false)}
                    className="text-[11px] text-ink-mute hover:text-ink"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {!isSchedulingOpen ? (
                selectedLeadForChat.status === 'Inspection Scheduled' && (selectedLeadForChat.appointmentDetails || selectedLeadForChat.scheduledDate) ? (
                  <div className="bg-accent-500/5 border border-accent-500/10 p-3 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center gap-4 text-accent-400 font-bold">
                      <p>Date: <span className="text-ink">{selectedLeadForChat.appointmentDetails?.date || selectedLeadForChat.scheduledDate?.split(' ')[0]}</span></p>
                      <p>Time: <span className="text-ink">{selectedLeadForChat.appointmentDetails?.time || selectedLeadForChat.scheduledDate?.split(' ').slice(1).join(' ')}</span></p>
                    </div>
                    {selectedLeadForChat.appointmentDetails?.notes && (
                      <p className="text-ink-soft text-[11px] italic bg-inset p-2 rounded-lg border border-line">
                        <span className="font-bold text-ink-mute not-italic uppercase text-[9px] block mb-0.5">Appointment Notes:</span>
                        "{selectedLeadForChat.appointmentDetails.notes}"
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-inset border border-line p-3.5 rounded-xl flex items-center justify-between text-xs text-ink-mute">
                    <span className="italic">No active inspection scheduled.</span>
                    <button
                      onClick={() => startScheduling(selectedLeadForChat)}
                      className="text-accent-400 hover:text-accent-300 font-bold flex items-center gap-1"
                    >
                      Schedule Free Inspection Now &rarr;
                    </button>
                  </div>
                )
              ) : (
                <div className="bg-inset p-4 rounded-xl border border-accent-500/20 space-y-3.5 animate-slideDown">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] text-ink-mute block mb-1 font-semibold">Appointment Date</label>
                      <input
                        type="date"
                        value={editApptDate}
                        onChange={e => setEditApptDate(e.target.value)}
                        className="w-full input-premium-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-mute block mb-1 font-semibold">Appointment Time (e.g. 10:00 AM)</label>
                      <input
                        type="text"
                        value={editApptTime}
                        onChange={e => setEditApptTime(e.target.value)}
                        className="w-full input-premium-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-mute block mb-1 font-semibold">Scheduler Notes</label>
                    <textarea
                      value={editApptNotes}
                      onChange={e => setEditApptNotes(e.target.value)}
                      rows={2}
                      placeholder="Enter details, customer preferences, shingle issues, or claims information."
                      className="w-full input-premium-sm"
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setIsSchedulingOpen(false)}
                      className="bg-inset hover:bg-inset text-ink-soft text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveAppointment(selectedLeadForChat.id)}
                      className="bg-gold hover:bg-gold-strong text-gold-ink text-[11px] font-black px-4 py-1.5 rounded-lg transition"
                    >
                      Save & Book Inspection
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Conversations Transcripts Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-inset premium-scroll">
              {selectedLeadForChat.chatLog.map((log, index) => {
                const isAI = log.sender === 'AI';
                const isSystem = log.sender === 'System';
                
                if (isSystem) {
                  return (
                    <div key={index} className="flex justify-center">
                      <span className="bg-inset text-[10px] font-semibold text-ink-mute px-3 py-1 rounded-md border border-line tracking-wide max-w-md text-center">
                        {log.timestamp} • {log.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-md rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      isAI 
                        ? 'chat-bubble-ai rounded-tl-none' 
                        : 'chat-bubble-user rounded-tr-none'
                    }`}>
                      <div className="flex justify-between items-center gap-4 mb-1 border-b border-line pb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                          {isAI ? 'RoofFlow AI Agent' : 'Homeowner User'}
                        </span>
                        <span className="text-[9px] opacity-50">
                          {log.timestamp}
                        </span>
                      </div>
                      <p className="whitespace-pre-line">{log.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Conversation footer details */}
            <div className="p-4 border-t border-line bg-inset text-xs text-ink-mute flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-accent-500" /> Lead Audit Trail verified
              </span>
              <button 
                onClick={() => { setSelectedLeadForChat(null); setIsSchedulingOpen(false); }}
                className="bg-inset hover:bg-inset text-ink font-bold px-4 py-2 rounded-xl border border-line"
              >
                Close Audit Log
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
