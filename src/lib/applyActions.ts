/**
 * applyActions.ts — turns the server's executed tool actions into CRM updates.
 * Pure function (no React) so it can be unit-tested. Only successful actions
 * are applied, and a booking is only ever recorded as REQUESTED (a human
 * confirms), never as a confirmed appointment.
 */
import type { Lead } from '../context/AppContext';

export interface AgentActionResult {
  ok: boolean;
  status: string;
  simulated: boolean;
  persisted: boolean;
  detail?: string;
  id?: string;
  error?: string;
}
export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
  result: AgentActionResult;
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function findLead(leads: Lead[], args: Record<string, unknown>): number {
  const phone = digits(args.phone ?? (args.to && !String(args.to).includes('@') ? args.to : args.contact));
  const email = str(args.email ?? (String(args.to ?? args.contact ?? '').includes('@') ? args.to ?? args.contact : '')).toLowerCase();
  return leads.findIndex(
    (l) => (phone.length >= 7 && digits(l.phone) === phone) || (email && l.email.toLowerCase() === email)
  );
}

export function applyActionsToLeads(leads: Lead[], actions: AgentAction[], now: Date = new Date()): Lead[] {
  let next = [...leads];
  const stamp = now.toLocaleString();
  const log = (l: Lead, text: string): Lead => ({
    ...l,
    chatLog: [...l.chatLog, { sender: 'System' as const, text: `🤖 ${text}`, timestamp: stamp }],
  });

  actions.forEach((a, i) => {
    if (!a.result.ok) return;
    const args = a.args;
    let idx = findLead(next, args);

    if (a.tool === 'book_inspection' || a.tool === 'update_crm') {
      if (idx === -1) {
        if (!str(args.phone) && !str(args.email)) return;
        const lead: Lead = {
          id: `ai-${now.getTime().toString(36)}-${i}`,
          name: str(args.name) || 'Unknown (AI chat)',
          phone: str(args.phone) || 'N/A',
          email: str(args.email) || 'N/A',
          propertyOwnership: 'Owner',
          status: 'New Lead',
          zipCode: 'N/A',
          roofIssue: 'Storm damage assessment',
          agentType: 'Chatbot',
          chatLog: [{ sender: 'System', text: '🤖 Lead created by AI agent.', timestamp: stamp }],
        };
        next = [lead, ...next];
        idx = 0;
      }
      let lead = next[idx];
      if (a.tool === 'book_inspection') {
        const when = str(args.preferred_time);
        lead = log(
          {
            ...lead,
            name: str(args.name) || lead.name,
            email: str(args.email) || lead.email,
            zipCode: str(args.address_or_zip) || lead.zipCode,
            roofIssue: str(args.issue) || lead.roofIssue,
            status: 'Inspection Scheduled',
            scheduledDate: `Requested: ${when}`,
            appointmentDetails: { date: 'TBC', time: when, notes: 'REQUESTED via AI agent. Awaiting team confirmation.' },
          },
          `Inspection requested for "${when}" (pending team confirmation).`
        );
      } else {
        const s = str(args.status);
        const mapped = s === 'Do Not Contact' ? 'Closed-Lost' : s;
        lead = {
          ...lead,
          name: str(args.name) || lead.name,
          zipCode: str(args.zip) || lead.zipCode,
          roofIssue: str(args.roof_issue) || lead.roofIssue,
          status: (mapped || lead.status) as Lead['status'],
        };
        const note = [s === 'Do Not Contact' ? 'DO NOT CONTACT requested.' : '', str(args.note)].filter(Boolean).join(' ');
        lead = log(lead, note ? `CRM updated: ${note}` : 'CRM updated.');
      }
      next = next.map((l, k) => (k === idx ? lead : l));
      return;
    }

    if (idx === -1) return;
    if (a.tool === 'send_message') {
      const demo = a.result.simulated ? ' (demo, not delivered)' : '';
      next = next.map((l, k) => (k === idx ? log(l, `${str(args.channel).toUpperCase()} ${a.result.status}${demo}: ${str(args.body).slice(0, 90)}`) : l));
    } else if (a.tool === 'schedule_followup') {
      next = next.map((l, k) =>
        k === idx ? log({ ...l, status: 'Follow-up Nurture' }, `Follow-up scheduled in ${args.when_hours}h via ${str(args.channel)}.`) : l
      );
    }
  });
  return next;
}
