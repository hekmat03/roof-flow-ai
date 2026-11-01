
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
