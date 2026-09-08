'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, CheckCheck, ClipboardList, Copy, Leaf, Loader2, Plus, Send, ShieldCheck, Snowflake, Sparkles, Sun, Trash2, Wind } from 'lucide-react';
import { Intro } from './site-app';
import { Notice, ServiceIcon } from './shared';
import { SERVICES, SEASON } from '@/lib/catalog';
import { buildPlanForServices, CARE_GOALS, carePlanBookingUrl, guidedPlan, type GuidedCarePlan } from '@/lib/planner';

const seasons = [{ name: 'Winter', icon: Snowflake }, { name: 'Spring', icon: Sun }, { name: 'Summer', icon: Leaf }, { name: 'Fall', icon: Wind }, { name: 'Year-round', icon: CheckCheck }];
const firstPlan = guidedPlan('An annual all-season plan for snow, lawn mowing, spring cleanup and fall cleanup.');
type Goal = typeof CARE_GOALS[number]['id'];

export function Planner() {
  const [goals, setGoals] = useState<Goal[]>(['annual']);
  const [propertyType, setPropertyType] = useState('House');
  const [frequency, setFrequency] = useState('Mixed / help me choose');
  const [needs, setNeeds] = useState('');
  const [drivewaySize, setDrivewaySize] = useState('large');
  const [lawnArea, setLawnArea] = useState('');
  const [snowStorage, setSnowStorage] = useState('');
  const [access, setAccess] = useState('');
  const [plan, setPlan] = useState<GuidedCarePlan>(firstPlan);
  const [selected, setSelected] = useState<string[]>(firstPlan.services);
  const [season, setSeason] = useState('All seasons');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [input, setInput] = useState('');
  const [replyMode, setReplyMode] = useState('Guided service advice');
  const [status, setStatus] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const currentPlan = useMemo(() => buildPlanForServices(selected, Object.fromEntries(plan.recommendations.map(r => [r.serviceId, r.reason]))), [selected, plan]);
  const catalog = SERVICES.filter(service => season === 'All seasons' || service.category === season);
  const activeSeasons = seasons.filter(item => currentPlan.recommendations.some(r => r.season === item.name));

  function updateGoals(goal: Goal) {
    setGoals(previous => previous.includes(goal) ? previous.filter(id => id !== goal) : [...previous, goal]);
  }
  function generate() {
    const description = [goals.map(id => CARE_GOALS.find(goal => goal.id === id)?.prompt).join(' '), needs].join('\n');
    const next = guidedPlan(description);
    setPlan(next); setSelected(next.services); setChecked([]); setStatus(next.services.length ? 'Your service plan has been updated. Review and adjust your selection below.' : 'Choose a care goal or describe a service to build your plan.');
    resultHeading.current?.focus({ preventScroll: true });
    resultHeading.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  function toggle(id: string) { setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); setStatus('Service selection updated.'); }
  function planText() {
    return `TRIOS · PROPERTY CARE PLAN\n\nProperty type: ${propertyType}\nRequested frequency: ${frequency}\n\nSERVICES FOR ASSESSMENT\n${currentPlan.recommendations.map(r => { const service = SERVICES.find(s => s.id === r.serviceId)!; return `• ${service.name} (${service.category}) — ${service.scope}`; }).join('\n')}\n\nPROPERTY NOTES\n${[lawnArea && `Lawn/garden area: ${lawnArea}`, snowStorage && `Snow placement: ${snowStorage}`, access, needs].filter(Boolean).join('\n') || 'To be supplied with quote request.'}\n\nPREPARATION\n${currentPlan.preparation.map(step => `• ${step}`).join('\n')}\n\nWinter season: ${SEASON}. This plan is guidance for a quote. Pricing, scope, availability and service dates require confirmation.`;
  }
  async function copy() { try { await navigator.clipboard.writeText(planText()); setStatus('Plan copied. You can keep it with your property notes.'); } catch { setStatus('Copy is unavailable in this browser. Use Download plan to keep a copy.'); } }
  function download() {
    const href = URL.createObjectURL(new Blob([planText()], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = href; link.download = 'trios-property-care-plan.txt'; link.click(); URL.revokeObjectURL(href); setStatus('Your property care plan was downloaded.');
  }
  function handoff() {
    const notes = [`Property type: ${propertyType}.`, needs && `Care goals: ${needs}`, access].filter(Boolean).join('\n').slice(0, 1500);
    try { sessionStorage.setItem('trios-planner-handoff', JSON.stringify({ version: 1, services: selected, frequency, details: { access: notes, plan: 'care-planner', drivewaySize, lawnArea: lawnArea.slice(0, 50), snowStorage: snowStorage.slice(0, 1000) } })); } catch { /* Service selections still travel in the URL when device storage is unavailable. */ }
  }
  async function ask() {
    if (busy || input.trim().length < 2) return;
    const question = input.trim(); setInput(''); setBusy(true); setReply('');
    try {
      const response = await fetch('/api/planner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question }), signal: AbortSignal.timeout(25000) });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== 'string') throw new Error('Guided advice fallback');
      setReply(data.reply); setReplyMode(data.mode === 'ai' ? 'AI-assisted advice · review before acting' : 'Guided service advice');
    } catch { setReply(guidedPlan(question).reply); setReplyMode('Guided advice · available without an AI connection'); }
    finally { setBusy(false); }
  }

  return <><Intro eyebrow="YOUR HOME. YOUR MOVE. ONE THOUGHTFUL PLAN." title="Build a plan that fits your life.">Choose what matters, shape your service mix and arrive at a quote request with the right details already prepared.</Intro><div className="container page-body care-planner-page">
    <div className="care-plan-journey"><span><b>01</b>Your property</span><ArrowRight size={19} /><span><b>02</b>Your service mix</span><ArrowRight size={19} /><span><b>03</b>Review & request</span></div>
    <div className="care-planner-layout"><div className="care-planner-main"><section className="white-card care-profile"><div className="care-section-heading"><span className="care-step-badge">01</span><div><h2>What can we take off your list?</h2><p>Pick one or combine a few. Your choices are a starting point for assessment.</p></div></div>
      <div className="care-goal-grid">{CARE_GOALS.map(goal => <button type="button" key={goal.id} aria-pressed={goals.includes(goal.id)} onClick={() => updateGoals(goal.id)}><span className="care-goal-check">{goals.includes(goal.id) ? <Check size={17} /> : <Plus size={17} />}</span><strong>{goal.label}</strong><span>{goal.description}</span></button>)}</div>
      <div className="form-grid care-profile-fields"><label>Property type<select value={propertyType} onChange={e => setPropertyType(e.target.value)}>{['House', 'Townhouse', 'Rental property', 'Small commercial property', 'Other / discuss with Trios'].map(type => <option key={type}>{type}</option>)}</select></label><label>Preferred frequency<select value={frequency} onChange={e => setFrequency(e.target.value)}>{['Mixed / help me choose', 'Seasonal', 'Weekly', 'Fortnightly', 'Monthly', 'One-time'].map(value => <option key={value}>{value}</option>)}</select></label><label className="wide">Anything else you want help with?<textarea rows={3} maxLength={1500} value={needs} onChange={e => setNeeds(e.target.value)} placeholder="For example: plan a local move, clean the old home, and care for the lawn at the new address." /></label></div>
      <details className="care-property-details"><summary>Make the quote easier: add property details <Plus size={18} /></summary><div className="form-grid"><label>Driveway category<select value={drivewaySize} onChange={e => setDrivewaySize(e.target.value)}><option value="large">Larger / unsure</option><option value="1">Single driveway</option><option value="2">Double driveway</option><option value="3">Triple driveway</option></select></label><label>Lawn / garden area<input value={lawnArea} onChange={e => setLawnArea(e.target.value)} maxLength={50} placeholder="e.g. about 2,000 sq ft, or unsure" /></label><label className="wide">Snow-placement space<textarea value={snowStorage} onChange={e => setSnowStorage(e.target.value)} maxLength={1000} rows={2} placeholder="Describe the available space within your property boundaries." /></label><label className="wide">Access & dimensions<textarea value={access} onChange={e => setAccess(e.target.value)} maxLength={1000} rows={3} placeholder="Gate width, driveway dimensions, parked cars, pets, slopes or fragile areas." /></label></div></details>
      <button type="button" className="button care-generate" onClick={generate}><Sparkles size={20} />Build my care plan<ArrowDown size={18} /></button></section>

      <section className="white-card care-services" aria-labelledby="care-plan-results"><div className="care-section-heading"><span className="care-step-badge">02</span><div><h2 ref={resultHeading} id="care-plan-results" tabIndex={-1}>Your service mix, your choice.</h2><p>Every suggestion has a reason. Add or remove services before requesting a quote.</p></div></div><div className="care-current-plan"><span><ShieldCheck size={19} />Guided recommendations · no booking made</span><p>{plan.reply}</p></div>
      <div className="care-season-filters" aria-label="Filter available services by season">{['All seasons', ...seasons.map(item => item.name)].map(value => <button type="button" key={value} aria-pressed={season === value} onClick={() => setSeason(value)}>{value}</button>)}</div>
      <div className="care-service-list">{catalog.map(service => { const chosen = selected.includes(service.id); const recommendation = plan.recommendations.find(r => r.serviceId === service.id); return <article className="care-service-option" data-selected={chosen} key={service.id}><div className="care-service-top"><span className="care-service-icon"><ServiceIcon name={service.icon} size={25} /></span><div><span className="care-service-category">{service.category} · {service.frequency}</span><h3>{service.name}</h3></div><button type="button" aria-pressed={chosen} aria-label={(chosen ? 'Remove ' : 'Add ') + service.name} onClick={() => toggle(service.id)}>{chosen ? <Check size={20} /> : <Plus size={20} />}</button></div><p>{recommendation ? recommendation.reason : service.summary}</p><div className="care-service-bottom"><span>{service.price}</span><a href={'/services/' + service.id}>Scope & details<ArrowRight size={16} /></a></div>{chosen && <p className="care-selected-note"><Check size={15} />Included in your quote request</p>}</article>; })}</div></section>

      <section className="white-card care-preparation"><div className="care-section-heading"><span className="care-step-badge">03</span><div><h2>A little preparation goes a long way.</h2><p>Use this local checklist to get ready. These ticks are for your planning and are not sent as service completion records.</p></div></div>{currentPlan.preparation.length ? <div className="care-checklist">{currentPlan.preparation.map(step => <label key={step}><input type="checkbox" checked={checked.includes(step)} onChange={() => setChecked(previous => previous.includes(step) ? previous.filter(value => value !== step) : [...previous, step])} /><span>{step}</span></label>)}</div> : <p>Select services to see a preparation checklist for your property.</p>}<details className="care-property-details"><summary>Details Trios will need for the quote<ClipboardList size={19} /></summary><ul className="care-question-list">{currentPlan.questions.map(question => <li key={question}>{question}</li>)}</ul></details></section>

      <section className="white-card care-ask"><div className="care-section-heading"><Sparkles size={29} /><div><h2>Need help deciding?</h2><p>Ask about services or scope. Advice will not change your selected plan.</p></div></div><form onSubmit={e => { e.preventDefault(); ask(); }}><label htmlFor="care-question">Your service question</label><div className="care-question-composer"><input id="care-question" value={input} onChange={e => setInput(e.target.value)} maxLength={2000} placeholder="Can I combine moving help with home cleaning?" /><button type="submit" className="button" disabled={busy || input.trim().length < 2}>{busy ? <Loader2 className="spin" size={19} /> : <Send size={19} />}<span>{busy ? 'Preparing…' : 'Ask'}</span></button></div></form><div aria-live="polite">{reply && <div className="care-guidance-reply"><strong>{replyMode}</strong><p>{reply}</p></div>}</div></section>
    </div>

    <aside className="care-plan-sidebar"><div className="care-plan-summary"><span className="eyebrow">YOUR PROPERTY, TAKEN CARE OF</span><h2>{selected.length} services.<br />One clear next step.</h2><p>Review your selection and carry it into a single property quote request.</p><div className="care-selected-services">{selected.length ? selected.map(id => { const service = SERVICES.find(item => item.id === id)!; return <div key={id}><ServiceIcon name={service.icon} size={19} /><span>{service.name}</span><button type="button" aria-label={'Remove ' + service.name} onClick={() => toggle(id)}><Trash2 size={17} /></button></div>; }) : <p>No services selected yet.</p>}</div><div className="care-frequency-note"><span>Requested frequency</span><strong>{frequency}</strong></div>{selected.length ? <a className="button care-request-link" href={carePlanBookingUrl(selected)} onClick={handoff}>Continue to my quote<ArrowRight size={19} /></a> : <button className="button" disabled>Select a service to continue</button>}<div className="care-plan-export"><button type="button" onClick={copy} disabled={!selected.length}><Copy size={17} />Copy plan</button><button type="button" onClick={download} disabled={!selected.length}><ClipboardList size={17} />Download plan</button></div><p className="care-plan-status" role="status">{status}</p><div className="care-plan-promise"><ShieldCheck size={23} /><p>Final pricing, scope, availability and service dates are confirmed by Trios after review.</p></div></div>
      <div className="care-season-timeline"><span className="eyebrow">HOW YOUR YEAR TAKES SHAPE</span>{activeSeasons.length ? activeSeasons.map(item => <div key={item.name}><span><item.icon size={21} /></span><div><h3>{item.name}</h3><p>{currentPlan.recommendations.filter(r => r.season === item.name).map(r => SERVICES.find(s => s.id === r.serviceId)?.name).join(' · ')}</p></div></div>) : <p>Select services to build your seasonal view.</p>}<p className="care-season-disclaimer">This is a service grouping, not a confirmed visit calendar. Timing depends on conditions and your agreement.</p></div>
    </aside></div><Notice>Winter service season: {SEASON}. Your final quote confirms scope, pricing and service arrangements. Assessment-only work needs a separate review.</Notice>
  </div>{selected.length > 0 && <div className="care-mobile-next"><span><strong>{selected.length} services</strong><br />Ready for quote review</span><a className="button" href={carePlanBookingUrl(selected)} onClick={handoff}>Review request<ArrowRight size={18} /></a></div>}</>;
}
