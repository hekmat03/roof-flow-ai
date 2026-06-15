import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Lead } from '../context/AppContext';
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

  // Status style helper
  const getStatusStyles = (status: Lead['status']) => {
    switch (status) {
      case 'New Lead':
        return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
      case 'Contacted':
        return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
      case 'In Contact':
        return 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5';
      case 'Inspection Scheduled':
        return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5 font-bold';
      case 'Inspection Completed':
        return 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5';
      case 'Estimate Sent':
        return 'text-fuchsia-400 border-fuchsia-500/20 bg-fuchsia-500/5';
      case 'Closed-Won':
        return 'text-green-400 border-green-500/30 bg-green-500/10 font-extrabold';
      case 'Closed-Lost':
        return 'text-red-400 border-red-500/20 bg-red-500/5';
      case 'Follow-up Nurture':
        return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5';
      case 'Closed':
      default:
        return 'text-slate-500 border-slate-800 bg-slate-900/50';
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
          <h2 className="text-2xl font-black text-white">CRM Leads Board</h2>
          <p className="text-xs text-slate-400 mt-1">Manage and track all captured roofing lead interactions, inspection bookings, and conversations.</p>
        </div>
        
        <button
          onClick={() => setIsAddOpen(!isAddOpen)}
          className="bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start"
        >
          <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
          Add Manual Lead
        </button>
      </div>

      {/* Manual Add Form (Collapsible Card) */}
      {isAddOpen && (
        <form onSubmit={handleCreateLead} className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-xl max-w-3xl animate-slideDown">
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Plus className="h-4 w-4 text-orange-500" /> Create New Lead Profile
            </h3>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Full Name *</label>
              <input
                type="text"
                required
                placeholder="Sarah Connor"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Phone Number *</label>
              <input
                type="tel"
                required
                placeholder="(214) 555-0100"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Email Address</label>
              <input
                type="email"
                placeholder="s.connor@sky.net (or leave empty)"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Property Ownership</label>
              <select
                value={newOwnership}
                onChange={e => setNewOwnership(e.target.value as 'Owner' | 'Renter')}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              >
                <option value="Owner">Property Owner</option>
                <option value="Renter">Renter / Tenant</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Initial Status</label>
              <select
                value={newStatus}
                onChange={e => setNewStatus(e.target.value as Lead['status'])}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
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
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Acquisition Source</label>
              <select
                value={newAgentType}
                onChange={e => setNewAgentType(e.target.value as Lead['agentType'])}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              >
                <option value="Chatbot">Agent 1: Website Chatbot</option>
                <option value="Phone Call">Agent 2: Phone Call Handler</option>
                <option value="SMS Nurture">Agent 3: SMS/Email Nurture</option>
                <option value="Estimate Follow-Up">Agent 4: Estimate Follow-Up</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-slate-800/60 pt-4">
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Zip Code</label>
              <input
                type="text"
                placeholder="75201"
                value={newZipCode}
                onChange={e => setNewZipCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Roof Issue Description</label>
              <input
                type="text"
                placeholder="Storm damage replacement estimate, leak assessment, etc."
                value={newRoofIssue}
                onChange={e => setNewRoofIssue(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Inline Scheduling options when status is Inspection Scheduled */}
          {newStatus === 'Inspection Scheduled' && (
            <div className="mt-4 p-4 rounded-xl bg-[#0f172a] border border-emerald-500/10 space-y-4">
              <h4 className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Schedule Initial Appointment Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Appointment Date *</label>
                  <input
                    type="date"
                    required
                    value={newApptDate}
                    onChange={e => setNewApptDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Appointment Time (e.g. 10:00 AM) *</label>
                  <input
                    type="text"
                    required
                    placeholder="10:00 AM"
                    value={newApptTime}
                    onChange={e => setNewApptTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Scheduler Notes (Internal/Customer preferences)</label>
                <textarea
                  placeholder="E.g., visible water stains on second floor ceiling, prefers afternoon visit."
                  value={newApptNotes}
                  onChange={e => setNewApptNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-xl text-sm transition border border-slate-700 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-orange-500 text-slate-950 font-bold px-5 py-2 rounded-xl text-sm transition shadow-lg shadow-orange-500/10 hover:bg-orange-600"
            >
              Save Lead to Database
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Dashboard Card */}
      <div className="bg-[#1e293b] border border-slate-800 rounded-2xl p-6 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-3 h-5 w-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, phone, email, zip or issue..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Quick Filter tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 lg:pb-0 scrollbar-none">
            <Filter className="h-4 w-4 text-slate-400 mr-1 shrink-0" />
            {['All', 'New Lead', 'Contacted', 'In Contact', 'Inspection Scheduled', 'Inspection Completed', 'Estimate Sent', 'Closed-Won', 'Closed-Lost', 'Follow-up Nurture', 'Closed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                    : 'bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Leads Table Container */}
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/30">
          <table className="w-full border-collapse text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 bg-[#1e293b]/50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4">Homeowner Name</th>
                <th className="px-6 py-4">Roof Issue / Zip</th>
                <th className="px-6 py-4">Acquisition Source</th>
                <th className="px-6 py-4">Workflow Status</th>
                <th className="px-6 py-4">Scheduled Inspection</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/10">
              {filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    className="hover:bg-slate-800/40 transition cursor-pointer"
                    onClick={() => setSelectedLeadForChat(lead)}
                  >
                    {/* Homeowner Name & Contact info */}
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center space-x-3">
                        <div 
                          className="h-9 w-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-orange-500 cursor-pointer"
                          onClick={() => setSelectedLeadForChat(lead)}
                        >
                          {lead.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="cursor-pointer" onClick={() => setSelectedLeadForChat(lead)}>
                          <p className="font-bold text-white">{lead.name}</p>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
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
                        <p className="text-xs text-slate-200 font-medium line-clamp-1 max-w-xs">{lead.roofIssue}</p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> Zip: {lead.zipCode}</p>
                      </div>
                    </td>

                    {/* Agent source */}
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-300 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 font-medium">
                        {lead.agentType}
                      </span>
                    </td>

                    {/* Status dropdown selector */}
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <select
                        value={lead.status}
                        onChange={e => handleStatusChange(lead.id, e.target.value as Lead['status'])}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-full border bg-[#1e293b] text-slate-200 border-slate-700 focus:outline-none ${getStatusStyles(lead.status)}`}
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
                        <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-mono">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>{lead.appointmentDetails?.date || lead.scheduledDate?.split(' ')[0]} {lead.appointmentDetails?.time || lead.scheduledDate?.split(' ').slice(1).join(' ')}</span>
                        </div>
                      ) : lead.status === 'Inspection Completed' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 px-2 py-0.5 rounded bg-cyan-400/5 border border-cyan-400/10">
                          <CheckCircle2 className="h-3 w-3" /> Completed
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 font-mono italic">Not Scheduled</span>
                      )}
                    </td>

                    {/* Quick view button actions */}
                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setSelectedLeadForChat(lead)}
                          className="bg-orange-500/10 hover:bg-orange-500 hover:text-slate-950 text-orange-400 font-bold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          View Log ({lead.chatLog.length})
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
                          title="Delete Lead"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-end animate-fadeIn">
          <div className="w-full max-w-2xl bg-[#1e293b] border-l border-slate-800 h-full flex flex-col justify-between shadow-2xl animate-slideLeft">
            
            {/* Panel Header */}
            <div className="p-6 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="h-11 w-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-orange-500 text-lg">
                  {selectedLeadForChat.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">{selectedLeadForChat.name}</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span>Acquired via: <span className="text-orange-400 font-bold">{selectedLeadForChat.agentType}</span></span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedLeadForChat(null); setIsSchedulingOpen(false); }}
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800 border border-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Homeowner Audit Profile Card */}
            <div className="p-4 bg-slate-900/60 border-b border-slate-800 grid grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-500" /> <span className="font-semibold text-white">Full Name:</span> {selectedLeadForChat.name}</p>
                <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-500" /> <span className="font-semibold text-white">Phone:</span> {selectedLeadForChat.phone}</p>
                <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-500" /> <span className="font-semibold text-white">Email:</span> {selectedLeadForChat.email}</p>
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-500" /> <span className="font-semibold text-white">Zip Code:</span> {selectedLeadForChat.zipCode}</p>
              </div>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5"><Home className="h-3.5 w-3.5 text-slate-500" /> <span className="font-semibold text-white">Ownership:</span> {selectedLeadForChat.propertyOwnership}</p>
                <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-500" /> <span className="font-semibold text-white">Status:</span> 
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusStyles(selectedLeadForChat.status)}`}>
                    {selectedLeadForChat.status}
                  </span>
                </p>
                <p className="flex items-start gap-1.5"><FileText className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" /> <span><span className="font-semibold text-white">Roof Issue:</span> {selectedLeadForChat.roofIssue}</span></p>
              </div>
            </div>

            {/* Scheduled Inspection Booking details with edit state */}
            <div className="p-4 bg-slate-900/40 border-b border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-emerald-400" /> Inspection Appointment Panel
                </h4>
                
                {!isSchedulingOpen ? (
                  <button
                    onClick={() => startScheduling(selectedLeadForChat)}
                    className="text-[11px] font-black bg-emerald-500 text-slate-950 px-3 py-1 rounded-md hover:bg-emerald-400 transition"
                  >
                    {selectedLeadForChat.status === 'Inspection Scheduled' ? 'Reschedule / Edit' : 'Schedule Inspection'}
                  </button>
                ) : (
                  <button
                    onClick={() => setIsSchedulingOpen(false)}
                    className="text-[11px] text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {!isSchedulingOpen ? (
                selectedLeadForChat.status === 'Inspection Scheduled' && (selectedLeadForChat.appointmentDetails || selectedLeadForChat.scheduledDate) ? (
                  <div className="bg-emerald-950/20 border border-emerald-500/10 p-3 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center gap-4 text-emerald-400 font-mono font-bold">
                      <p>Date: <span className="text-white">{selectedLeadForChat.appointmentDetails?.date || selectedLeadForChat.scheduledDate?.split(' ')[0]}</span></p>
                      <p>Time: <span className="text-white">{selectedLeadForChat.appointmentDetails?.time || selectedLeadForChat.scheduledDate?.split(' ').slice(1).join(' ')}</span></p>
                    </div>
                    {selectedLeadForChat.appointmentDetails?.notes && (
                      <p className="text-slate-300 text-[11px] italic bg-slate-900/40 p-2 rounded-lg border border-slate-800/50">
                        <span className="font-bold text-slate-400 not-italic uppercase text-[9px] block mb-0.5">Appointment Notes:</span>
                        "{selectedLeadForChat.appointmentDetails.notes}"
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950/30 border border-slate-800/80 p-3.5 rounded-xl flex items-center justify-between text-xs text-slate-400">
                    <span className="italic">No active inspection scheduled.</span>
                    <button
                      onClick={() => startScheduling(selectedLeadForChat)}
                      className="text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1"
                    >
                      Schedule Free Inspection Now &rarr;
                    </button>
                  </div>
                )
              ) : (
                <div className="bg-slate-900 p-4 rounded-xl border border-emerald-500/20 space-y-3.5 animate-slideDown">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Appointment Date</label>
                      <input
                        type="date"
                        value={editApptDate}
                        onChange={e => setEditApptDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Appointment Time (e.g. 10:00 AM)</label>
                      <input
                        type="text"
                        value={editApptTime}
                        onChange={e => setEditApptTime(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Scheduler Notes</label>
                    <textarea
                      value={editApptNotes}
                      onChange={e => setEditApptNotes(e.target.value)}
                      rows={2}
                      placeholder="Enter details, customer preferences, shingle issues, or claims information."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setIsSchedulingOpen(false)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveAppointment(selectedLeadForChat.id)}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black px-4 py-1.5 rounded-lg transition"
                    >
                      Save & Book Inspection
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Conversations Transcripts Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#0f172a]/60">
              {selectedLeadForChat.chatLog.map((log, index) => {
                const isAI = log.sender === 'AI';
                const isSystem = log.sender === 'System';
                
                if (isSystem) {
                  return (
                    <div key={index} className="flex justify-center">
                      <span className="bg-slate-800/80 text-[10px] font-semibold text-slate-400 px-3 py-1 rounded-md border border-slate-800/80 font-mono tracking-wide max-w-md text-center">
                        {log.timestamp} • {log.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-md rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      isAI 
                        ? 'bg-slate-800 text-slate-100 border border-slate-700/80 rounded-tl-none' 
                        : 'bg-orange-500 text-slate-950 font-bold rounded-tr-none'
                    }`}>
                      <div className="flex justify-between items-center gap-4 mb-1 border-b border-slate-700/30 pb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
                          {isAI ? 'RoofFlow AI Agent' : 'Homeowner User'}
                        </span>
                        <span className="text-[9px] opacity-50 font-mono">
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
            <div className="p-4 border-t border-slate-800 bg-[#0f172a] text-xs text-slate-500 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-emerald-500" /> Lead Audit Trail verified
              </span>
              <button 
                onClick={() => { setSelectedLeadForChat(null); setIsSchedulingOpen(false); }}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl border border-slate-700"
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
