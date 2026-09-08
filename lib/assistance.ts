import { SERVICES } from './catalog';

/** Business checks are deliberately deterministic. They never write records or send messages. */
export type AssistantCategory = 'intake' | 'dispatch' | 'payments' | 'equipment' | 'preparation';
export type AssistantPriority = 'urgent' | 'review' | 'ready';
export type AssistantTab = 'Requests' | 'Schedule' | 'Billing' | 'Equipment' | 'Team' | 'Messages' | 'Settings';
export interface AssistanceRequest {
  id: string; customer_name?: string; email?: string; phone?: string; address?: string;
  area?: string; postal_code?: string; frequency?: string; services?: unknown; details?: unknown;
  status?: string; created_at?: string; updated_at?: string;
}
export interface AssistanceJob {
  id: string; request_id?: string; service?: string; scheduled_date?: string; time_window?: string;
  crew_id?: string | null; crew_name?: string; status?: string; priority?: string;
  address?: string; customer_name?: string; details?: unknown; notes?: string; access_notes?: string;
}
export interface AssistanceInvoice {
  id: string; request_id?: string; customer_name?: string; address?: string; email?: string;
  amount_cents?: number; tax_cents?: number; paid_cents?: number; due_date?: string; status?: string;
}
export interface AssistanceEquipment { id: string; name?: string; kind?: string; status?: string; next_service?: string }
export interface AssistanceCrew { id: string; name?: string; active?: boolean | number }
export interface AssistanceSnapshot {
  requests?: AssistanceRequest[]; jobs?: AssistanceJob[]; invoices?: AssistanceInvoice[];
  equipment?: AssistanceEquipment[]; crew?: AssistanceCrew[]; settings?: { dailyCapacity?: number };
}
export interface AssistantRecommendation {
  id: string; category: AssistantCategory; priority: AssistantPriority; title: string;
  description: string; evidence: string[]; action: { tab: AssistantTab; label: string; recordId?: string };
  draft?: string; checklist?: string[]; date?: string;
}
export interface IntakeReadiness { complete: number; total: number; percent: number; missing: string[]; evidence: string[] }

export const ASSISTANT_CATEGORIES: { id: AssistantCategory; label: string; description: string }[] = [
  { id: 'intake', label: 'Quote readiness', description: 'Find missing property details and the next step for accepted work.' },
  { id: 'dispatch', label: 'Dispatch checks', description: 'Review unassigned visits, overdue work and crew capacity.' },
  { id: 'payments', label: 'Payment follow-ups', description: 'Prepare a polite draft from the recorded invoice balance.' },
  { id: 'equipment', label: 'Equipment care', description: 'Check saved maintenance dates and equipment status.' },
  { id: 'preparation', label: 'Visit preparation', description: 'Make the agreed work area ready for the next visit.' },
];

export function serviceIds(value: unknown): string[] {
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && SERVICES.some(s => s.id === id)))];
}
export function propertyDetails(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { return {}; } }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const label = (value: unknown, fallback: string): string => text(value) || fallback;
const activeJob = (job: AssistanceJob): boolean => job.status === 'scheduled' || job.status === 'in_progress';
const ref = (id: string): string => `TR-${id.slice(0, 8).toUpperCase()}`;
const cash = (cents: number): string => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function localServiceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Johns', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)?.value).join('-');
}
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export function assessIntake(request: AssistanceRequest): IntakeReadiness {
  const details = propertyDetails(request.details), services = serviceIds(request.services);
  const checks: [string, boolean][] = [
    ['Customer name', text(request.customer_name).length >= 2],
    ['Reply email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(request.email))],
    ['Contact phone', text(request.phone).replace(/\D/g, '').length >= 7],
    ['Property address', text(request.address).length >= 5],
    ['Community', !!text(request.area)],
    ['Postal code', /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ][ -]?\d[ABCEGHJ-NPRSTVWXYZ]\d$/i.test(text(request.postal_code))],
    ['Requested services', services.length > 0],
    ['Visit frequency', !!text(request.frequency)],
    ['Access or dimension notes', !!text(details.access)],
  ];
  if (services.includes('snow')) checks.push(['Driveway category', ['1', '2', '3', 'large'].includes(text(details.drivewaySize))], ['Snow placement area', !!text(details.snowStorage)], ['Surface and slope', !!text(details.surface) && !!text(details.slope)]);
  if (services.some(id => ['lawn', 'garden', 'aeration'].includes(id))) checks.push(['Approximate lawn or garden area', !!text(details.lawnArea)]);
  if (details.priority === true) checks.push(['Preferred departure time for priority review', !!text(details.departureTime)]);
  const complete = checks.filter(([, ready]) => ready).length;
  return { complete, total: checks.length, percent: Math.round(complete / checks.length * 100), missing: checks.filter(([, ready]) => !ready).map(([name]) => name), evidence: [`${complete} of ${checks.length} useful intake details supplied.`, 'This checks supplied details only; scope, pricing and availability still need a human review.'] };
}

/** Preparation is a checklist, not a promise of safety, arrival time, or accepted work. */
export function preparationSteps(ids: string[]): string[] {
  const known = serviceIds(ids), steps: string[] = [];
  if (!known.length) return ['Confirm the service, access instructions and agreed work area before the visit.'];
  if (known.some(id => ['snow', 'walkways', 'ice', 'windrow'].includes(id))) steps.push('Move vehicles and loose items out of the agreed clearing area.', 'Identify fragile edges, steps and the agreed snow-placement space.', 'Tell Trios about blocked access or changed departure needs; use the agreed response window.');
  if (known.some(id => ['lawn', 'garden', 'spring', 'fall', 'aeration', 'hedges'].includes(id))) steps.push('Clear toys, hoses and pet waste from the agreed work area.', 'Provide gate access and keep pets clear during the visit.');
  if (known.includes('aeration')) steps.push('Identify irrigation, shallow cables and other underground features before aeration.');
  if (known.some(id => ['spring', 'fall', 'garden', 'hedges', 'hauling'].includes(id))) steps.push('Agree where clippings or collected materials will be left; off-site disposal must be in the quote.');
  if (known.includes('bins')) steps.push('Confirm collection day, bin storage and the permitted collection point.');
  if (known.includes('cleaning')) steps.push('Confirm access, room scope, linen arrangements and any supplies to be used.');
  if (known.includes('furniture')) steps.push('Identify the on-property storage space and any heavy or fragile items for assessment.');
  if (known.some(id => ['washing', 'windows', 'gutters'].includes(id))) steps.push('Confirm assessed access and surfaces before cleaning; keep the agreed area clear.');
  return [...new Set(steps)];
}

export function invoiceBalance(invoice: AssistanceInvoice): number | null {
  const values = [invoice.amount_cents, invoice.tax_cents ?? 0, invoice.paid_cents ?? 0];
  if (values.some(n => typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)) return null;
  const total = (values[0] as number) + (values[1] as number);
  if (!Number.isSafeInteger(total) || (values[2] as number) > total) return null;
  return total - (values[2] as number);
}

export function buildServiceAssistance(snapshot: AssistanceSnapshot, options: { today?: string; audience?: 'admin' | 'crew' } = {}): AssistantRecommendation[] {
  const today = options.today ?? localServiceDate();
  if (!isCalendarDate(today)) throw new Error('Assistance requires a valid local calendar date.');
  const crewOnly = options.audience === 'crew';
  const jobs = (snapshot.jobs || []).filter(activeJob);
  const requests = crewOnly ? [] : snapshot.requests || [];
  const results: AssistantRecommendation[] = [];

  for (const request of requests.filter(r => r.status === 'requested')) {
    const readiness = assessIntake(request), name = label(request.customer_name, 'Customer');
    results.push({ id: `intake:${request.id}`, category: 'intake', priority: readiness.missing.length ? 'review' : 'ready',
      title: readiness.missing.length ? `${name}: ${readiness.missing.length} details to clarify` : `${name}: intake ready for review`,
      description: label(request.address, ref(request.id)), evidence: [...readiness.evidence, ...(readiness.missing.length ? [`To clarify: ${readiness.missing.join('; ')}.`] : [])],
      action: { tab: 'Requests', label: readiness.missing.length ? 'Review property details' : 'Prepare a quote', recordId: request.id },
      ...(readiness.missing.length ? { draft: `Hello ${name},\n\nThank you for your property-care request (${ref(request.id)}). To help us assess the scope and prepare a quote, could you confirm:\n\n${readiness.missing.map(item => `• ${item}`).join('\n')}\n\nYour quote and service timing will be confirmed after review.\n\nTrios Snow and Mowing Inc.` } : {}),
    });
  }
  for (const request of requests.filter(r => r.status === 'accepted')) {
    const scheduled = (snapshot.jobs || []).some(j => j.request_id === request.id && j.status !== 'cancelled');
    if (!scheduled) results.push({ id: `accepted:${request.id}`, category: 'dispatch', priority: 'review', title: 'Accepted work needs its first visit', description: `${label(request.customer_name, 'Customer')} · ${label(request.address, ref(request.id))}`, evidence: ['Request status is accepted.', 'No non-cancelled visit is present in the loaded records.'], action: { tab: 'Requests', label: 'Plan the first visit', recordId: request.id } });
  }

  const roster = new Map((snapshot.crew || []).map(c => [c.id, c]));
  for (const job of jobs) {
    const day = job.scheduled_date;
    const validDay = isCalendarDate(day), late = validDay && day < today;
    const inactive = !crewOnly && !!job.crew_id && roster.has(job.crew_id) && !roster.get(job.crew_id)?.active;
    const unassigned = !crewOnly && !job.crew_id;
    const missingWindow = !text(job.time_window) || /to be|tbd|confirm|agreed with customer/i.test(text(job.time_window));
    const facts = [...(!validDay ? ['The saved visit date is missing or invalid.'] : late ? [`The visit is still ${job.status} after its saved date (${job.scheduled_date}).`] : []), ...(unassigned ? ['No crew member is assigned.'] : []), ...(inactive ? ['The assigned crew member is inactive on the loaded roster.'] : []), ...(missingWindow ? ['The visit time window still needs confirmation.'] : [])];
    if (facts.length) results.push({ id: `dispatch:${job.id}`, category: 'dispatch', priority: late || inactive || !validDay ? 'urgent' : 'review', title: late ? 'A past visit still needs a status update' : inactive ? 'Review an inactive crew assignment' : unassigned ? 'Assign this visit to a crew member' : 'Confirm visit arrangements', description: `${label(job.customer_name, 'Customer')} · ${label(job.address, ref(job.id))}`, evidence: facts, action: { tab: 'Schedule', label: crewOnly ? 'Open assigned visit' : 'Review this visit', recordId: job.id }, date: job.scheduled_date });
    if (validDay && day >= today && daysBetween(today, day) <= 7) {
      const request = requests.find(r => r.id === job.request_id), details = propertyDetails(job.details ?? request?.details);
      const checklist = preparationSteps(job.service ? [job.service] : serviceIds(request?.services)), accessNotes = text(job.access_notes) || text(details.access);
      results.push({ id: `prep:${job.id}`, category: 'preparation', priority: 'ready', title: `${job.scheduled_date === today ? 'Today' : job.scheduled_date}: prepare for ${SERVICES.find(s => s.id === job.service)?.name.toLowerCase() || 'the visit'}`, description: label(job.address, ref(job.id)), evidence: [`Saved visit: ${job.scheduled_date} · ${label(job.time_window, 'time window not set')}.`, ...(accessNotes ? [`Property access notes: ${accessNotes}`] : ['No property access notes are included in the loaded visit.'])], checklist, action: { tab: 'Schedule', label: 'Review visit & instructions', recordId: job.id }, date: job.scheduled_date,
        ...(!crewOnly ? { draft: `Hello ${label(job.customer_name, 'there')},\n\nWe are reviewing preparation for your property-care visit at ${label(job.address, 'your property')} on the saved schedule date, ${job.scheduled_date}. Please check the latest arrangements in your account.\n\n${checklist.map(item => `• ${item}`).join('\n')}\n\nLet us know if access or your requirements have changed.\n\nTrios Snow and Mowing Inc.` } : {}),
      });
    }
  }

  if (!crewOnly) {
    const capacity = snapshot.settings?.dailyCapacity;
    if (typeof capacity === 'number' && Number.isInteger(capacity) && capacity > 0) {
      const dayLoads = new Map<string, AssistanceJob[]>();
      for (const job of jobs) if (job.crew_id && isCalendarDate(job.scheduled_date) && job.scheduled_date >= today) {
        const key = `${job.crew_id}|${job.scheduled_date}`;
        dayLoads.set(key, [...(dayLoads.get(key) || []), job]);
      }
      for (const [key, visits] of dayLoads) if (visits.length >= Math.ceil(capacity * .8)) {
        const first = visits[0], name = label(roster.get(first.crew_id!)?.name ?? first.crew_name, 'Assigned crew');
        results.push({ id: `capacity:${key}`, category: 'dispatch', priority: visits.length > capacity ? 'urgent' : 'review', title: `${name}: ${visits.length >= capacity ? 'daily capacity reached' : 'approaching daily capacity'}`, description: `${first.scheduled_date} · ${visits.length} open visits / ${capacity} configured limit`, evidence: [`${visits.length} scheduled or in-progress visits share this crew and day.`, `Review threshold: 80% of the saved ${capacity}-visit daily limit.`, 'This is a visit-count check; travel time, task duration and weather are not estimated.'], action: { tab: 'Schedule', label: 'Review the day’s assignments', recordId: first.id }, date: first.scheduled_date });
      }
    }
    for (const invoice of snapshot.invoices || []) {
      const balance = invoiceBalance(invoice);
      if (invoice.status === 'void' || invoice.status === 'cancelled') continue;
      if (balance === null || (invoice.status === 'paid' && balance > 0)) {
        results.push({ id: `balance:${invoice.id}`, category: 'payments', priority: 'review', title: 'Verify this invoice record before following up', description: `${ref(invoice.id)} · ${label(invoice.customer_name, 'Customer')}`, evidence: [balance === null ? 'The loaded balance contains missing or invalid amounts.' : 'The paid status and recorded remaining balance do not agree.'], action: { tab: 'Billing', label: 'Review invoice records', recordId: invoice.id } });
        continue;
      }
      if (!balance) continue;
      const dueDate = invoice.due_date;
      const validDue = isCalendarDate(dueDate), overdue = validDue && dueDate < today;
      const nearDue = validDue && daysBetween(today, dueDate) <= 3;
      if (!overdue && !nearDue && validDue) continue;
      const name = label(invoice.customer_name, 'there');
      results.push({ id: `invoice:${invoice.id}`, category: 'payments', priority: overdue ? 'urgent' : 'review', title: overdue ? `${daysBetween(dueDate, today)} days overdue · ${cash(balance)} remaining` : validDue ? `${cash(balance)} due ${dueDate}` : 'Confirm the invoice due date', description: `${ref(invoice.id)} · ${label(invoice.customer_name, 'Customer')}`, evidence: [`Invoice total: ${cash((invoice.amount_cents || 0) + (invoice.tax_cents || 0))}; verified receipts: ${cash(invoice.paid_cents || 0)}.`, validDue ? `Saved due date: ${invoice.due_date}.` : 'No valid due date is present.', 'The draft uses saved payment records; confirm any recently received transfer before sending.'], action: { tab: 'Billing', label: 'Review invoice & payments', recordId: invoice.id }, date: invoice.due_date,
        ...(validDue ? { draft: `Hello ${name},\n\nA quick note about invoice ${ref(invoice.id)}${invoice.address ? ` for ${invoice.address}` : ''}. Our records show ${cash(balance)} remaining, with a due date of ${invoice.due_date}.\n\nIf you have already sent payment, please share the transfer reference so we can reconcile it. Otherwise, please review the invoice and its payment instructions in your account. Let us know if you have any questions.\n\nThank you,\nTrios Snow and Mowing Inc.` } : {}),
      });
    }
    for (const equipment of snapshot.equipment || []) {
      const nextService = equipment.next_service;
      const valid = isCalendarDate(nextService), due = valid && daysBetween(today, nextService) <= 7;
      if (equipment.status === 'Ready' && valid && !due) continue;
      const overdue = valid && nextService < today, out = equipment.status === 'Out of service';
      results.push({ id: `equipment:${equipment.id}`, category: 'equipment', priority: out || overdue ? 'urgent' : 'review', title: `${label(equipment.name, 'Equipment')}: ${out ? 'out of service' : overdue ? 'maintenance date passed' : due ? 'maintenance approaching' : 'review maintenance plan'}`, description: label(equipment.kind, 'Equipment record'), evidence: [`Saved status: ${label(equipment.status, 'not specified')}.`, valid ? `Next maintenance date: ${equipment.next_service}.` : 'A valid next maintenance date has not been recorded.', 'Confirm condition and maintenance requirements before assigning this equipment.'], action: { tab: 'Equipment', label: 'Update maintenance record', recordId: equipment.id }, date: equipment.next_service });
    }
  }
  const rank: Record<AssistantPriority, number> = { urgent: 0, review: 1, ready: 2 };
  return results.sort((a, b) => rank[a.priority] - rank[b.priority] || (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id));
}
