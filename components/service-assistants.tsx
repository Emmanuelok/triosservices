'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, CheckCheck, ClipboardList, Copy, FileCheck2, ListChecks, ShieldCheck, Truck, Wallet, Wrench } from 'lucide-react';
import { ASSISTANT_CATEGORIES, buildServiceAssistance, localServiceDate, type AssistanceSnapshot, type AssistantCategory, type AssistantRecommendation, type AssistantTab } from '@/lib/assistance';

const icons = { intake: FileCheck2, dispatch: Truck, payments: Wallet, equipment: Wrench, preparation: ListChecks };
const priorityLabel = { urgent: 'Needs attention', review: 'Review next', ready: 'Ready to prepare' };

export interface ServiceAssistantsProps {
  data: AssistanceSnapshot;
  onNavigate: (tab: AssistantTab, recordId?: string) => void;
  audience?: 'admin' | 'crew';
  compact?: boolean;
  today?: string;
}

function Recommendation({ item, onNavigate }: { item: AssistantRecommendation; onNavigate: ServiceAssistantsProps['onNavigate'] }) {
  const [copyStatus, setCopyStatus] = useState('');
  const Icon = icons[item.category];
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(item.draft || '');
      setCopyStatus('Draft copied. Review it before using it in your chosen channel.');
    } catch { setCopyStatus('Copy is unavailable here. Select the draft text below and copy it manually.'); }
  }
  return <article className="assistant-recommendation" data-priority={item.priority}>
    <div className="assistant-recommendation-head"><span className="assistant-category-icon"><Icon size={23} /></span><span className={'assistant-priority ' + item.priority}>{priorityLabel[item.priority]}</span></div>
    <h3>{item.title}</h3><p className="assistant-record-label">{item.description}</p>
    <div className="assistant-evidence"><strong>Why this appears</strong><ul>{item.evidence.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div>
    {!!item.checklist?.length && <div className="assistant-prep-list"><strong>Preparation checklist</strong><ul>{item.checklist.map(step => <li key={step}><Check size={17} /><span>{step}</span></li>)}</ul></div>}
    {item.draft && <details className="assistant-draft"><summary><ClipboardList size={18} />Review a follow-up draft</summary><label htmlFor={'draft-' + item.id}>Draft only · nothing has been sent</label><textarea id={'draft-' + item.id} value={item.draft} readOnly rows={9} /><button type="button" className="button small outline" onClick={copyDraft}><Copy size={17} />Copy draft</button><p className="assistant-copy-status" role="status">{copyStatus}</p></details>}
    <button type="button" className="button outline assistant-open-action" onClick={() => onNavigate(item.action.tab, item.action.recordId)}>{item.action.label}<ArrowRight size={18} /></button>
  </article>;
}

export function ServiceAssistants({ data, onNavigate, audience = 'admin', compact = false, today: date }: ServiceAssistantsProps) {
  const today = date || localServiceDate();
  const [category, setCategory] = useState<AssistantCategory | 'all'>('all');
  const [priority, setPriority] = useState('all');
  const [limit, setLimit] = useState(12);
  const recommendations = useMemo(() => buildServiceAssistance(data, { today, audience }), [data, today, audience]);
  const urgent = recommendations.filter(r => r.priority === 'urgent').length;
  const review = recommendations.filter(r => r.priority === 'review').length;
  const ready = recommendations.filter(r => r.priority === 'ready').length;
  const categories = audience === 'crew' ? ASSISTANT_CATEGORIES.filter(c => ['dispatch', 'preparation'].includes(c.id)) : ASSISTANT_CATEGORIES;
  const matching = recommendations.filter(r => (category === 'all' || r.category === category) && (priority === 'all' || r.priority === priority));
  const visible = compact ? recommendations.slice(0, 3) : matching.slice(0, limit);

  return <section className={'service-assistants' + (compact ? ' compact' : '')} aria-label={audience === 'crew' ? 'Visit preparation assistant' : 'Business service assistants'}>
    <header className="assistant-heading"><div><span className="eyebrow">{audience === 'crew' ? 'YOUR NEXT BEST STEP' : 'FIVE ASSISTANTS. ONE WORKING PICTURE.'}</span><h2>{audience === 'crew' ? 'Arrive prepared.' : 'Know what needs you next.'}</h2><p>{audience === 'crew' ? 'Checks and preparation drawn from your loaded assigned visits.' : 'Property details, dispatch, payments and equipment—reviewed together from your saved records.'}</p></div><span className="assistant-method"><ShieldCheck size={21} />Transparent, rule-based checks</span></header>
    {!compact && <><div className="assistant-summary"><div><strong>{urgent}</strong><span>Need attention</span></div><div><strong>{review}</strong><span>To review next</span></div><div><strong>{ready}</strong><span>Preparation notes</span></div><div className="assistant-snapshot-note"><CheckCheck size={25} /><span>As of {today}<small>Loaded records · St. John’s date</small></span></div></div>
      <div className="assistant-categories" aria-label="Assistant categories"><button type="button" aria-pressed={category === 'all'} onClick={() => { setCategory('all'); setLimit(12); }}><span>All assistants</span><b>{recommendations.length}</b></button>{categories.map(item => { const Icon = icons[item.id]; return <button type="button" key={item.id} title={item.description} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setLimit(12); }}><Icon size={19} /><span>{item.label}</span><b>{recommendations.filter(r => r.category === item.id).length}</b></button>; })}</div>
      <div className="assistant-filter-row"><p role="status">{matching.length} {matching.length === 1 ? 'recommendation' : 'recommendations'}{category !== 'all' ? ` · ${categories.find(c => c.id === category)?.label}` : ''}</p><label>Show<select value={priority} onChange={e => { setPriority(e.target.value); setLimit(12); }}><option value="all">All priorities</option><option value="urgent">Needs attention</option><option value="review">Review next</option><option value="ready">Preparation notes</option></select></label></div></>}
    {visible.length ? <div className="assistant-grid">{visible.map(item => <Recommendation key={item.id} item={item} onNavigate={onNavigate} />)}</div> : <div className="assistant-empty"><CheckCheck size={32} /><h3>{recommendations.length ? 'No recommendations match this filter.' : 'No issues were found in these checks.'}</h3><p>{recommendations.length ? 'Choose another category or priority to review the remaining items.' : 'These checks use only loaded records. New requests, visits, invoices and maintenance dates will create useful next steps here.'}</p></div>}
    {!compact && matching.length > limit && <button type="button" className="button outline assistant-load-more" onClick={() => setLimit(count => count + 12)}>Show 12 more recommendations<ArrowRight size={18} /></button>}
    <p className="assistant-footnote">Recommendations do not change bookings, send messages or confirm payment. Review the source record before acting.</p>
  </section>;
}
