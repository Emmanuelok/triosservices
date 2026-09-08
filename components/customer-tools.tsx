'use client';

import { useEffect, useState } from 'react';
import { Mail, Phone, ShieldCheck, RefreshCw } from 'lucide-react';
import { CONTACT } from '@/lib/catalog';

export type CustomerReadiness = { status: 'ready' | 'setup_required' | 'unavailable'; bookingAvailable: boolean; accountsAvailable: boolean; photosAvailable?: boolean };
export function useCustomerReadiness() {
  const [readiness, setReadiness] = useState<CustomerReadiness | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const unavailable: CustomerReadiness = { status: 'unavailable', bookingAvailable: false, accountsAvailable: false, photosAvailable: false };
    const timeout = window.setTimeout(() => { controller.abort(); if (active) setReadiness(unavailable); }, 10000);
    fetch('/api/health', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (!response.ok || !['ready', 'setup_required', 'unavailable'].includes(value.status)) throw Error('Unavailable');
      if (active && !controller.signal.aborted) setReadiness({ status: value.status, bookingAvailable: value.bookingAvailable === true, accountsAvailable: value.accountsAvailable === true, photosAvailable: value.photosAvailable === true });
    }).catch(() => { if (active) setReadiness(unavailable); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [revision]);
  return { readiness, retry: () => { setReadiness(null); setRevision(value => value + 1); } };
}

export function CustomerContact({ compact = false, body, retry, unavailable = true }: { compact?: boolean; body?: string; retry?: () => void; unavailable?: boolean }) {
  const email = `mailto:${CONTACT.email}?subject=${encodeURIComponent('Property care enquiry')}${body ? '&body=' + encodeURIComponent(body) : ''}`;
  return <section className={'customer-contact' + (compact ? ' compact' : '')} aria-label="Contact Trios">
    <div><span className="customer-kicker">LET’S TALK ABOUT YOUR PROPERTY</span><h3>Personal help is a call away.</h3>
      <p>{unavailable ? 'Online requests are not available right now. You can still prepare your enquiry, then call or email Trios. Nothing is submitted until you send your email or speak with the team.' : 'Need help accessing your account or discussing your property? Call or email Trios and the team will help you with the next step.'}</p></div>
    <div className="customer-contact-actions"><a className="button" href={'tel:' + CONTACT.tel}><Phone size={18}/>{CONTACT.phone}</a><a className="button outline" href={email}><Mail size={18}/>{body ? 'Open email with my details' : 'Email Trios'}</a>{retry && <button type="button" className="text-link" onClick={retry}><RefreshCw size={16}/>Check availability again</button>}</div>
  </section>;
}

export function CustomerPrivacyNote() { return <div className="customer-privacy"><ShieldCheck size={19}/><span>Your account, Trios administrators and your assigned crew see the records relevant to their role.</span></div>; }

export function parseList(value: unknown): string[] {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []; } catch { return []; }
}
export function parseDetails(value: unknown): Record<string, any> {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
export function customerToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Johns', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function invoiceBalance(invoice: any) { return Math.max(0, Number(invoice.amount_cents || 0) + Number(invoice.tax_cents || 0) - Number(invoice.paid_cents || 0)); }
export function reference(id: string) { return 'TR-' + String(id).slice(0, 8).toUpperCase(); }
