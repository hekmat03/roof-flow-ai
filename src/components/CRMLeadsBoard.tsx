```tsx
  // continuation — lines 221–440

  return updatedLead;
      }
      return lead;
    }));

    setIsSchedulingOpen(false);
    setSelectedLeadForChat(prev => {
      if (!prev || prev.id !== leadId) return prev;
      return {
        ...prev,
        status: 'Inspection Scheduled',
        scheduledDate: `${editApptDate} ${editApptTime}`,
        appointmentDetails: {
          date: editApptDate,
          time: editApptTime,
          notes: editApptNotes
        }
      };
    });
  };

  const statusOptions: Lead['status'][] = [
    'New Lead',
    'Contacted',
    'In Contact',
    'Inspection Scheduled',
    'Inspection Completed',
    'Estimate Sent',
    'Closed-Won',
    'Closed-Lost',
    'Follow-up Nurture',
    'Closed'
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-orange-500" /> CRM Leads Board
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage captured homeowners, track their pipeline status, and review agent conversations.
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="btn-accent px-4 py-2.5 text-xs flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add New Lead
        </button>
      </div>

      <div className="glass rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name, phone, email, ZIP, or roof issue..."
              className="input-premium pl-10 text-xs"
            />
          </div>
          <div className="relative md:w-56">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="input-premium pl-10 text-xs"
            >
              <option value="All">All Statuses</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          <span>{filteredLeads.length} of {leads.length} leads</span>
          <span>Live CRM Data</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[850px]">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="py-3 px-3">Homeowner</th>
                <th className="py-3 px-3">Contact</th>
                <th className="py-3 px-3">Roof Issue</th>
                <th className="py-3 px-3">Source</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3">
                    <button
                      onClick={() => setSelectedLeadForChat(lead)}
                      className="text-left"
                    >
                      <p className="text-xs font-bold text-white hover:text-orange-400">{lead.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> ZIP {lead.zipCode}
                      </p>
                    </button>
                  </td>
                  <td className="py-3 px-3">
                    <p className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-slate-500" /> {lead.phone}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
                      <Mail className="h-3 w-3" /> {lead.email}
                    </p>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[11px] text-slate-300">{lead.roofIssue}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10px] text-slate-400">{lead.agentType}</span>
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={lead.status}
                      onChange={e => handleStatusChange(lead.id, e.target.value as Lead['status'])}
                      className={`text-[10px] font-bold rounded-lg px-2 py-1.5 border bg-slate-900 ${getStatusStyles(lead.status)}`}
                    >
                      {statusOptions.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedLeadForChat(lead)}
                        title="View conversation"
                        className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedLeadForChat(lead);
                          startScheduling(lead);
                        }}
                        title="Schedule inspection"
                        className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-orange-400"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
                        title="Delete lead"
                        className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-500">
                    No leads match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-white">Add New CRM Lead</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateLead} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Full Name *</label>
                  <input required value={newName} onChange={e => setNewName(e.target.value)} className="input-premium mt-1 text-xs" placeholder="Homeowner name" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Phone *</label>
                  <input required value={newPhone} onChange={e => setNewPhone(e.target.value)} className="input-premium mt-1 text-xs" placeholder="Phone number" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Email</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="input-premium mt-1 text-xs" placeholder="Email address" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">ZIP Code</label>
                  <input value={newZipCode} onChange={e => setNewZipCode(e.target.value)} className="input-premium mt-1 text-xs" placeholder="75201" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Property Ownership</label>
                  <select value={newOwnership} onChange={e => setNewOwnership(e.target.value as 'Owner' | 'Renter')} className="input-premium mt-1 text-xs">
                    <option value="Owner">Owner</option>
                    <option value="Renter">Renter</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Lead Status</label>
                  <select value={newStatus} onChange={e => setNewStatus(e.target.value as Lead['status'])} className="input-premium mt-1 text-xs">
                    {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Agent Source</label>
                  <select value={newAgentType} onChange={e => setNewAgentType(e.target.value as Lead['agentType'])} className="input-premium mt-1 text-xs">
                    <option value="Chatbot">Chatbot</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="SMS Nurture">SMS Nurture</option>
                    <option value="Estimate Follow-Up">Estimate Follow-Up</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Roof Issue</label>
                  <input value={newRoofIssue} onChange={e => setNewRoofIssue(e.target.value)} className="input-premium mt-1 text-xs" placeholder="Storm damage assessment" />
                </div>
              </div>

              {newStatus === 'Inspection Scheduled' && (
                <div className="border border-orange-500/20 bg-orange-500/5 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-orange-400 flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Inspection Appointment Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase">Date</label>
                      <input type="date" value={newApptDate} onChange={e => setNewApptDate(e.target.value)} className="input-premium mt-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase">Time</label>
                      <input type="time" value={newApptTime} onChange={e => setNewApptTime(e.target.value)} className="input-premium mt-1 text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Notes</label>
                    <input value={newApptNotes} onChange={e => setNewApptNotes(e.target.value)} className="input-premium mt-1 text-xs" placeholder="Appointment notes" />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" className="btn-accent px-5 py-2.5 text-xs">Save Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
          className="btn-accent px-4 py-2.5 text-sm flex items-center gap-2 self-start"
        >
          <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
          Add Manual Lead
        </button>
      </div>

      {/* Manual Add Form (Collapsible Card) */}
      {isAddOpen && (
        <form onSubmit={handleCreateLead} className="glass rounded-2xl p-6 shadow-xl max-w-3xl animate-slideDown">
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
                className="input-premium"
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
                className="input-premium"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Email Address</label>
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
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Property Ownership</label>
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
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Initial Status</label>
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
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Acquisition Source</label>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-slate-800/60 pt-4">
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Zip Code</label>
              <input
                type="text"
                placeholder="75201"
                value={newZipCode}
                onChange={e => setNewZipCode(e.target.value)}
                className="input-premium"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2 font-semibold">Roof Issue Description</label>
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
            <div className="mt-4 p-4 rounded-xl bg-[#0f172a] border border-accent-500/20 space-y-4">
              <h4 className="text-xs font-bold uppercase text-accent-400 flex items-center gap-1.5">
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
                    className="w-full input-premium-sm"
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
                    className="w-full input-premium-sm"
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
      <div className="glass card-hover rounded-2xl p-5 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-3 h-5 w-5 text-slate-500" />
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
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-white">Your leads</h3>
            <span className="text-xs text-slate-500">
              — captured by your chatbot and saved to your account.
            </span>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/20 premium-scroll table-sticky-header">
          <table className="w-full border-collapse text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/85 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4">Homeowner Name</th>
                <th className="px-6 py-4">Roof Issue / Zip</th>
                <th className="px-6 py-4">Acquisition Source</th>
                <th className="px-6 py-4">Workflow Status</th>
                <th className="px-6 py-4">Scheduled Inspection</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 row-stripe bg-slate-900/10">
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
                          className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/60 flex items-center justify-center font-bold text-accent-300 shadow-lg cursor-pointer"
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
                        <div className="flex items-center space-x-1.5 text-xs text-accent-400 font-mono">
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
                          className="bg-accent-500/10 hover:bg-accent-500 hover:text-slate-950 text-accent-400 font-bold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1 min-h-0"
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
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                      <div className="h-12 w-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                        <Users className="h-6 w-6 text-slate-500" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-300">Your CRM is ready</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        No leads yet. Every lead your chatbot captures lands here with its full conversation transcript.
                      </p>
                      <p className="text-[11px] text-slate-400 font-semibold">
                        Open Agent 1: Chatbot from the menu and try a conversation.
                      </p>
                    </div>
                  </td>
                </tr>
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
          <div className="w-full max-w-2xl glass-strong border-l border-slate-800/80 h-full flex flex-col justify-between shadow-2xl animate-slideLeft">

            {/* Panel Header */}
            <div className="p-6 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
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
              <div className="col-span-2">
                <span className="text-[11px] text-slate-500">Captured by your chatbot.</span>
              </div>
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
                  <Calendar className="h-4 w-4 text-accent-400" /> Inspection Appointment Panel
                </h4>

                {!isSchedulingOpen ? (
                  <button
                    onClick={() => startScheduling(selectedLeadForChat)}
                    className="text-[11px] font-black bg-accent-500 text-slate-950 px-3 py-1 rounded-md hover:bg-accent-400 transition"
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
              681: 
682:               {!isSchedulingOpen ? (
683:                 selectedLeadForChat.status === 'Inspection Scheduled' && (selectedLeadForChat.appointmentDetails || selectedLeadForChat.scheduledDate) ? (
684:                   <div className="bg-accent-500/10 border border-accent-500/20 p-3 rounded-xl space-y-2 text-xs">
685:                     <div className="flex items-center gap-4 text-accent-400 font-mono font-bold">
686:                       <p>Date: <span className="text-white">{selectedLeadForChat.appointmentDetails?.date || selectedLeadForChat.scheduledDate?.split(' ')[0]}</span></p>
687:                       <p>Time: <span className="text-white">{selectedLeadForChat.appointmentDetails?.time || selectedLeadForChat.scheduledDate?.split(' ').slice(1).join(' ')}</span></p>
688:                     </div>
689:                     {selectedLeadForChat.appointmentDetails?.notes && (
690:                       <p className="text-slate-300 text-[11px] italic bg-slate-900/40 p-2 rounded-lg border border-slate-800/50">
691:                         <span className="font-bold text-slate-400 not-italic uppercase text-[9px] block mb-0.5">Appointment Notes:</span>
692:                         "{selectedLeadForChat.appointmentDetails.notes}"
693:                       </p>
694:                     )}
695:                   </div>
696:                 ) : (
697:                   <div className="bg-slate-950/30 border border-slate-800/80 p-3.5 rounded-xl flex items-center justify-between text-xs text-slate-400">
698:                     <span className="italic">No active inspection scheduled.</span>
699:                     <button
700:                       onClick={() => startScheduling(selectedLeadForChat)}
701:                       className="text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1"
702:                     >
703:                       Schedule Free Inspection Now &rarr;
704:                     </button>
705:                   </div>
706:                 )
707:               ) : (
708:                 <div className="bg-slate-900 p-4 rounded-xl border border-accent-500/20 space-y-3.5 animate-slideDown">
709:                   <div className="grid grid-cols-2 gap-3 text-xs">
710:                     <div>
711:                       <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Appointment Date</label>
712:                       <input
713:                         type="date"
714:                         value={editApptDate}
715:                         onChange={e => setEditApptDate(e.target.value)}
716:                         className="w-full input-premium-sm"
717:                       />
718:                     </div>
719:                     <div>
720:                       <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Appointment Time (e.g. 10:00 AM)</label>
721:                       <input
722:                         type="text"
723:                         value={editApptTime}
724:                         onChange={e => setEditApptTime(e.target.value)}
725:                         className="w-full input-premium-sm"
726:                       />
727:                     </div>
728:                   </div>
729:                   <div>
730:                     <label className="text-[10px] text-slate-400 block mb-1 font-semibold">Scheduler Notes</label>
731:                     <textarea
732:                       value={editApptNotes}
733:                       onChange={e => setEditApptNotes(e.target.value)}
734:                       rows={2}
735:                       placeholder="Enter details, customer preferences, shingle issues, or claims information."
736:                       className="w-full input-premium-sm"
737:                     />
738:                   </div>
739:                   <div className="flex justify-end space-x-2">
740:                     <button
741:                       onClick={() => setIsSchedulingOpen(false)}
742:                       className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
743:                     >
744:                       Cancel
745:                     </button>
746:                     <button
747:                       onClick={() => handleSaveAppointment(selectedLeadForChat.id)}
748:                       className="bg-accent-500 hover:bg-accent-400 text-slate-950 text-[11px] font-black px-4 py-1.5 rounded-lg transition"
749:                     >
750:                       Save & Book Inspection
751:                     </button>
752:                   </div>
753:                 </div>
754:               )}
755:             </div>
756: 
757:             {/* Conversations Transcripts Scroll Area */}
758:             <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/50 premium-scroll">
759:               {selectedLeadForChat.chatLog.map((log, index) => {
760:                 const isAI = log.sender === 'AI';
761:                 const isSystem = log.sender === 'System';
762:                 
763:                 if (isSystem) {
764:                   return (
765:                     <div key={index} className="flex justify-center">
766:                       <span className="bg-slate-800/80 text-[10px] font-semibold text-slate-400 px-3 py-1 rounded-md border border-slate-800/80 font-mono tracking-wide max-w-md text-center">
767:                         {log.timestamp} • {log.text}
768:                       </span>
769:                     </div>
770:                   );
771:                 }
772: 
773:                 return (
774:                   <div key={index} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
775:                     <div className={`max-w-md rounded-2xl px-4 py-3 text-xs leading-relaxed ${
776:                       isAI 
777:                         ? 'chat-bubble-ai rounded-tl-none' 
778:                         : 'chat-bubble-user rounded-tr-none'
779:                     }`}>
780:                       <div className="flex justify-between items-center gap-4 mb-1 border-b border-slate-700/30 pb-0.5">
781:                         <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
782:                           {isAI ? 'RoofFlow AI Agent' : 'Homeowner User'}
783:                         </span>
784:                         <span className="text-[9px] opacity-50 font-mono">
785:                           {log.timestamp}
786:                         </span>
787:                       </div>
788:                       <p className="whitespace-pre-line">{log.text}</p>
789:                     </div>
790:                   </div>
791:                 );
792:               })}
793:             </div>
794: 
795:             {/* Conversation footer details */}
796:             <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 text-xs text-slate-500 flex items-center justify-between">
797:               <span className="flex items-center gap-1">
798:                 <ShieldCheck className="h-4 w-4 text-accent-400" /> Lead Audit Trail verified
799:               </span>
800:               <button 
801:                 onClick={() => { setSelectedLeadForChat(null); setIsSchedulingOpen(false); }}
802:                 className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl border border-slate-700"
803:               >
804:                 Close Audit Log
805:               </button>
806:             </div>
807: 
808:           </div>
809:         </div>
810:       )}
811:     </div>
812:   );
813: };
