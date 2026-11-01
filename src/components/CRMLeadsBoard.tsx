
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

              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500/50 transition"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-slate-400">
              <Filter className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Filter Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-accent-500/50"
            >
              <option value="All">All Leads</option>
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
        </div>

        {/* Leads Table */}
        <div className="mt-6 overflow-x-auto premium-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                <th className="px-4 py-3">Lead Profile</th>
                <th className="px-4 py-3">Contact Info</th>
                <th className="px-4 py-3">Roof Issue / ZIP</th>
                <th className="px-4 py-3">Agent Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-800/30 transition group">
                  <td className="px-4 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{lead.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{lead.propertyOwnership}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        <Phone className="h-3 w-3 text-slate-500" /> {lead.phone}
                      </p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Mail className="h-3 w-3 text-slate-500" /> {lead.email}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs text-slate-300 max-w-[180px] truncate">{lead.roofIssue}</p>
                    <p className="flex items-center gap-1 text-[10px] text-slate-500 mt-1 font-mono">
                      <MapPin className="h-3 w-3" /> {lead.zipCode}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/60 border border-slate-700/50 px-2 py-1 rounded-md whitespace-nowrap">
                      {lead.agentType}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={lead.status}
                      onChange={e => handleStatusChange(lead.id, e.target.value as Lead['status'])}
                      className={`text-[10px] font-bold rounded-lg px-2.5 py-1.5 border border-slate-700/50 bg-slate-900 focus:outline-none cursor-pointer ${getStatusStyles(lead.status)}`}
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
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => setSelectedLeadForChat(lead)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-accent-500/20 text-slate-400 hover:text-accent-400 transition"
                        title="View Conversation & Schedule"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
                        title="Delete Lead"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Users className="h-8 w-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-400">No leads found</p>
                    <p className="text-xs text-slate-600 mt-1">Try adjusting your search or filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800/60 flex justify-between items-center text-[10px] text-slate-500 font-mono">
          <span>SHOWING {filteredLeads.length} OF {leads.length} LEADS</span>
          <span>CRM SYSTEM • SECURE LEAD TRACKING</span>
        </div>
      </div>

      {/* Lead Conversation Slide-Over Panel */}
      {selectedLeadForChat && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-[#0b1120] border-l border-slate-800 shadow-2xl flex flex-col h-full animate-slideLeft">
            {/* Panel Header */}
            <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-900/50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-black text-white">{selectedLeadForChat.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusStyles(selectedLeadForChat.status)}`}>
                    {selectedLeadForChat.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400">Lead profile and conversation audit trail</p>
              </div>
              <button
                onClick={() => { setSelectedLeadForChat(null); setIsSchedulingOpen(false); }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lead Profile Summary */}
            <div className="p-6 border-b border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs text-slate-300"><Phone className="h-3.5 w-3.5 text-slate-500" /> {selectedLeadForChat.phone}</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-300"><Mail className="h-3.5 w-3.5 text-slate-500" /> {selectedLeadForChat.email}</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-300"><MapPin className="h-3.5 w-3.5 text-slate-500" /> ZIP: {selectedLeadForChat.zipCode}</p>
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
