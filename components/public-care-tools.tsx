'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Snowflake, Leaf, Sun, Wind, CalendarDays, Search, Plus, Minus } from 'lucide-react';
import { SERVICES, SEASON, faqs } from '@/lib/catalog';

export const CARE_SEASONS = [
  { id: 'Winter', icon: Snowflake, label: 'A clearer start.', months: 'November – April', image: '/winter-hero.webp', text: 'Build a winter plan around your driveway, daily routine and the access you need.', tasks: ['Agree where snow can be placed', 'Identify steps, edges and access needs', 'Confirm the snowfall trigger and visit terms'], serviceIds: ['snow', 'walkways', 'ice'] },
  { id: 'Spring', icon: Sun, label: 'Make room for growth.', months: 'As the ground opens up', image: '/summer-lawn.webp', text: 'Bring the yard back into shape once snow clears and ground conditions allow.', tasks: ['Collect loose winter litter and branches', 'Agree which garden beds need attention', 'Review lawn recovery and growing conditions'], serviceIds: ['spring', 'aeration', 'garden'] },
  { id: 'Summer', icon: Leaf, label: 'Your weekends, back.', months: 'During the growing season', image: '/summer-lawn.webp', text: 'Keep a regular rhythm for the lawn, garden and outdoor spaces you enjoy.', tasks: ['Choose a mowing frequency', 'Measure lawn area and gate access', 'Add garden or ground-level hedge care'], serviceIds: ['lawn', 'garden', 'hedges'] },
  { id: 'Fall', icon: Wind, label: 'Ready for what’s next.', months: 'Before winter settles in', image: '/summer-lawn.webp', text: 'Clear fallen leaves, pack away the patio and prepare the property for colder days.', tasks: ['Agree leaf collection and material handling', 'Prepare furniture for on-property storage', 'Review your winter access plan'], serviceIds: ['fall', 'furniture', 'snow'] },
] as const;

export function SeasonalExplorer({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState('Winter');
  const season = CARE_SEASONS.find(s => s.id === active)!;
  return <section className={'public-season-explorer' + (compact ? ' public-season-compact' : '')} aria-label="Explore care by season">
    <div className="public-section-heading"><div><div className="eyebrow">ONE PROPERTY. A WHOLE YEAR.</div><h2>Find your season.<br /><span>We’ll help with the rest.</span></h2></div><p>Choose a season to see the work worth planning. Your final schedule follows your property, the weather and available routes.</p></div>
    <div className="public-season-tabs" aria-label="Choose a season">{CARE_SEASONS.map(s => <button type="button" key={s.id} aria-pressed={s.id === active} onClick={() => setActive(s.id)}><s.icon size={23} /><span>{s.id}</span></button>)}</div>
    <div className="public-season-content" key={season.id}>
      <div className="public-season-image"><img src={season.image} width={1536} height={1024} loading="lazy" alt={season.id === 'Winter' ? 'Snow surrounding a Newfoundland home and driveway' : 'A lawn and garden beside a Newfoundland home'} /><span className="public-photo-note">{season.id === 'Winter' ? 'Plan for Newfoundland winters' : 'Care through the growing season'}</span></div>
      <div className="public-season-copy"><span className="public-kicker"><CalendarDays size={20} />{season.months}</span><h3>{season.label}</h3><p>{season.text}</p><ul className="public-checklist">{season.tasks.map(task => <li key={task}><Check size={20} /><span>{task}</span></li>)}</ul><div className="public-season-service-links">{season.serviceIds.map(id => { const service = SERVICES.find(s => s.id === id); return service ? <a key={id} href={'/services/' + id}>{service.name}<ArrowUpRight size={17} /></a> : null; })}</div><a className="button" href={'/book?services=' + season.serviceIds.join(',')}>Build my {season.id.toLowerCase()} request <ArrowRight size={21} /></a>{season.id === 'Winter' && <p className="public-note">Winter service period: {SEASON}</p>}</div>
    </div>
  </section>;
}

export function PublicFAQ({ title = 'Clear answers, before you book.', searchable = true }: { title?: string; searchable?: boolean }) {
  const [search, setSearch] = useState('');
  const filtered = faqs.filter(([q, a]) => (q + ' ' + a).toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="public-faq" aria-label="Frequently asked questions"><div className="public-section-heading"><div><div className="eyebrow">GOOD TO KNOW</div><h2>{title}</h2></div>{searchable && <label className="public-search"><Search size={21} /><input aria-label="Search questions" placeholder="Search your question…" value={search} onChange={e => setSearch(e.target.value)} type="search" /></label>}</div><div className="public-faq-list">{filtered.map(([q, a]) => <details key={q}><summary><span>{q}</span><Plus size={21} className="public-faq-plus" /><Minus size={21} className="public-faq-minus" /></summary><p>{a}</p></details>)}</div>{!filtered.length && <div className="public-empty"><p>No answers match that search.</p><button type="button" className="button outline" onClick={() => setSearch('')}>Show all questions</button></div>}<div className="public-faq-help"><p>Have a question about your particular property?</p><a className="text-link" href="/contact">Talk to Trios <ArrowUpRight size={20} /></a></div></section>;
}

export function CareProcess() {
  return <section className="public-process"><div className="public-section-heading"><div><div className="eyebrow">FROM REQUEST TO ROUTINE</div><h2>A clear path to<br /><span>better property care.</span></h2></div><p>Know what is being requested, what has been agreed and what happens after each visit.</p></div><ol className="public-process-grid">{[
    ['01', 'Describe your property', 'Choose services, share dimensions and tell us about your access needs. Photos help explain the work.'],
    ['02', 'Review the proposal', 'Trios assesses the scope and route. Review the final price, service terms and payment arrangements.'],
    ['03', 'Keep your care together', 'Use your signed-in property account for quotes, agreed visits, completion records and invoices.'],
  ].map(([number, title, text]) => <li key={number}><span className="public-process-number">{number}</span><h3>{title}</h3><p>{text}</p></li>)}</ol><div className="public-process-foot"><Check size={20} /><span>A quote request is not a confirmed booking. Your accepted agreement defines the work.</span></div></section>;
}
