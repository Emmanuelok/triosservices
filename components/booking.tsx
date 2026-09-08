'use client';

import { useEffect, useState, useRef } from 'react';
import { ArrowRight, ArrowLeft, Check, CheckCircle2, ShieldCheck, RotateCcw, FileDown, Copy, Pencil, CheckSquare, Leaf, Snowflake, Layers } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { SERVICES, AREAS, SEASON, money, snowEstimate, niceDate } from '@/lib/catalog';
import { Pick, ServiceIcon, useData, saveData, Notice, ErrorNotice, UploadPhotos, Loading } from './shared';
import { Intro } from './site-app';
import { CustomerContact, useCustomerReadiness, customerToday } from './customer-tools';
import { MovingIntake, MovingBrief } from './moving-intake';
import { MOVE_TYPES, MOVING_TIERS, cleanMoving, defaultMoving, movingSummary, movingSchema, type MovingDetails } from '@/lib/moving';

const initial = { name: '', email: '', phone: '', address: '', area: 'St. John’s', postalCode: '', services: ['snow'], frequency: 'Seasonal', details: { drivewaySize: '1', salt: false, walkway: false, priority: false, departureTime: '', lawnArea: '', surface: 'Paved', slope: 'Level', access: '', snowStorage: '', preferredDate: '', photos: [] as string[], plan: '', moving: undefined as MovingDetails | undefined } };
type QuoteForm = typeof initial;
const draftPrefix = 'trios-quote-draft:v2:';
const frequencies = ['Seasonal', 'Weekly', 'Fortnightly', 'Monthly', 'One-time', 'Mixed / help me choose'];
const allowedServices = new Set(SERVICES.map(service => service.id));
const allowedPlans = ['annual', 'care-planner', 'winter', 'summer', 'lawn', 'moving'];
const validServices = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && allowedServices.has(id)))].slice(0, SERVICES.length) : [];
function validDraftDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}
function cleanForm(value: unknown): QuoteForm {
  const draft = value && typeof value === 'object' ? value as Record<string, any> : {};
  const details = draft.details && typeof draft.details === 'object' ? draft.details : {};
  const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
  return { ...initial, name: text(draft.name, 100), email: text(draft.email, 200), phone: text(draft.phone, 30), address: text(draft.address, 250), postalCode: text(draft.postalCode, 7), area: AREAS.includes(draft.area) ? draft.area : initial.area, services: validServices(draft.services).length ? validServices(draft.services) : initial.services, frequency: frequencies.includes(draft.frequency) ? draft.frequency : initial.frequency, details: { ...initial.details, drivewaySize: ['1', '2', '3', 'large'].includes(details.drivewaySize) ? details.drivewaySize : '1', salt: details.salt === true, walkway: details.walkway === true, priority: details.priority === true, departureTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(details.departureTime) ? details.departureTime : '', lawnArea: text(details.lawnArea, 50), surface: ['Paved', 'Concrete', 'Gravel', 'Interlocking', 'Other'].includes(details.surface) ? details.surface : 'Paved', slope: ['Level', 'Slight slope', 'Steep slope'].includes(details.slope) ? details.slope : 'Level', access: text(details.access, 1500), snowStorage: text(details.snowStorage, 1000), preferredDate: validDraftDate(details.preferredDate), photos: Array.isArray(details.photos) ? details.photos.filter((id: unknown) => typeof id === 'string' && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)).slice(0, 6) : [], plan: allowedPlans.includes(details.plan) ? details.plan : '', moving: details.moving && typeof details.moving === 'object' ? cleanMoving(details.moving) : undefined } };
}
function consumeQuery(form: QuoteForm): QuoteForm {
  const params = new URLSearchParams(window.location.search);
  let result = { ...form, details: { ...form.details } };
  const ids = validServices((params.get('services') || params.get('service') || '').split(','));
  if (ids.length) result.services = ids;
  const plan = params.get('plan');
  if (plan === 'annual') { result.services = ['snow', 'lawn', 'spring', 'fall']; result.frequency = 'Mixed / help me choose'; }
  if (plan === 'lawn') { if (!ids.length) result.services = ['lawn']; result.frequency = 'Weekly'; }
  if (plan === 'winter' && !ids.length) result.services = ['snow'];
  if (plan === 'summer' && !ids.length) result.services = ['lawn', 'garden'];
  if (plan === 'moving' && !ids.length) result.services = ['moving'];
  if (plan && allowedPlans.includes(plan)) result.details.plan = plan;
  if (params.has('postal')) result.postalCode = String(params.get('postal')).slice(0, 7).toUpperCase();
  if (['1', '2', '3', 'large'].includes(params.get('drivewaySize') || '')) result.details.drivewaySize = params.get('drivewaySize')!;
  if (params.get('salt') === '1') result.details.salt = true;
  if (params.get('walkway') === '1') result.details.walkway = true;
  if (plan === 'care-planner') {
    try {
      const handoff = JSON.parse(sessionStorage.getItem('trios-planner-handoff') || 'null');
      sessionStorage.removeItem('trios-planner-handoff');
      if (handoff?.version === 1 && handoff.details?.plan === 'care-planner') {
        const plannerServices = validServices(handoff.services);
        if (plannerServices.length) result.services = plannerServices;
        if (frequencies.includes(handoff.frequency)) result.frequency = handoff.frequency;
        for (const [key, max] of [['access', 1500], ['lawnArea', 50], ['snowStorage', 1000]] as const) if (typeof handoff.details[key] === 'string') result.details[key] = handoff.details[key].slice(0, max);
        if (['1', '2', '3', 'large'].includes(handoff.details.drivewaySize)) result.details.drivewaySize = handoff.details.drivewaySize;
      }
    } catch { /* An invalid handoff never replaces a customer's details. */ }
  }
  if (result.services.includes('moving')) {
    result.details.moving = { ...(result.details.moving || defaultMoving()) };
    const tier = params.get('tier');
    if (tier && MOVING_TIERS.some(option => option.id === tier)) result.details.moving = { ...result.details.moving, tier: defaultMoving(tier).tier, transport: defaultMoving(tier).transport };
    const transport = params.get('transport');
    if (result.details.moving.tier === 'help') result.details.moving.transport = 'Customer arranged';
    else if (transport === 'Customer arranged' || transport === 'Request transport') result.details.moving.transport = transport;
    const moveType = params.get('moveType');
    if (moveType && MOVE_TYPES.some(type => type === moveType)) result.details.moving.moveType = moveType as MovingDetails['moveType'];
    result.details.moving.origin = { ...result.details.moving.origin, address: result.address || result.details.moving.origin.address };
    result.address ||= result.details.moving.origin.address;
    if (result.services.length === 1 || result.services.every(id => ['moving', 'cleaning', 'hauling'].includes(id))) result.frequency = 'One-time';
    else if (ids.length || plan === 'care-planner') result.frequency = 'Mixed / help me choose';
  }
  return result;
}

export function Booking() {
  const [form, setForm] = useState<QuoteForm>(initial), [step, setStep] = useState(0), [ready, setReady] = useState(false), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [selectedProperty, setSelectedProperty] = useState('choose'), [category, setCategory] = useState('All services'), [resetOpen, setResetOpen] = useState(false), [draftState, setDraftState] = useState('Preparing your request…');
  const [restored, setRestored] = useState(false), [formScope, setFormScope] = useState('');
  const id = useRef(''), stepHeading = useRef<HTMLHeadingElement>(null), previousStep = useRef(0), loadedScope = useRef(''), firstLoad = useRef(true);
  const lifecycle = useRef(0);
  const { data, loading: accountLoading, error: accountError } = useData();
  const { readiness, retry } = useCustomerReadiness();
  const scope = data?.user?.id || 'guest';

  useEffect(() => {
    if (accountLoading || loadedScope.current === scope) return;
    ++lifecycle.current;
    let next = cleanForm(initial), found = false;
    id.current = '';
    try {
      sessionStorage.removeItem('trios-quote-draft');
      const record = JSON.parse(sessionStorage.getItem(draftPrefix + scope) || 'null');
      if (record?.version === 2 && record.scope === scope && Date.now() - record.savedAt < 24 * 60 * 60 * 1000) { next = cleanForm(record.form); found = true; if (/^[\da-f-]{36}$/i.test(record.requestId || '')) id.current = record.requestId; }
      const handoff = JSON.parse(sessionStorage.getItem('trios-quote-signin-handoff') || 'null');
      if (scope !== 'guest') {
        sessionStorage.removeItem('trios-quote-signin-handoff');
        sessionStorage.removeItem(draftPrefix + 'guest');
        if (!found && handoff?.version === 2 && Date.now() - handoff.savedAt < 30 * 60 * 1000 && handoff.email === data.user.email.toLowerCase()) { next = cleanForm(handoff.form); next.details.photos = []; found = true; }
      }
    } catch { /* Storage may be unavailable in a private session. */ }
    if (firstLoad.current) { next = consumeQuery(next); firstLoad.current = false; }
    if (data?.user) { next.name ||= data.user.name || ''; next.email ||= data.user.email || ''; }
    if (scope === 'guest') next.details.photos = [];
    loadedScope.current = scope; setForm(next); setFormScope(scope); setReady(true); setRestored(found); setConsent(false); setSuccess(''); setStep(0); setSelectedProperty('choose'); setError(''); setBusy(false);
  }, [scope, accountLoading, data?.user]);
  useEffect(() => {
    if (!ready || success || formScope !== scope) return;
    try { sessionStorage.setItem(draftPrefix + scope, JSON.stringify({ version: 2, scope, form, requestId: id.current, savedAt: Date.now() })); setDraftState('Draft saved in this browser tab'); }
    catch { setDraftState('Draft is kept on this page only'); }
  }, [form, ready, success, scope, formScope]);
  useEffect(() => {
    const clear = () => {
      ++lifecycle.current;
      try { for (let index = sessionStorage.length - 1; index >= 0; index--) { const key = sessionStorage.key(index); if (key?.startsWith(draftPrefix) || key === 'trios-quote-signin-handoff') sessionStorage.removeItem(key); } } catch {}
      setReady(false); setForm(cleanForm(initial)); setFormScope(''); setConsent(false); setSuccess(''); setError(''); setBusy(false); id.current = ''; loadedScope.current = '';
    };
    window.addEventListener('trios:signout', clear); return () => { ++lifecycle.current; window.removeEventListener('trios:signout', clear); };
  }, []);
  useEffect(() => {
    if (!ready || !data?.properties?.length || selectedProperty !== 'choose') return;
    const propertyId = new URLSearchParams(window.location.search).get('property');
    const property = data.properties.find((item: any) => item.id === propertyId);
    if (property) selectProperty(property.id);
  }, [ready, data?.properties]);
  useEffect(() => { if (previousStep.current !== step) { previousStep.current = step; stepHeading.current?.focus({ preventScroll: true }); stepHeading.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); } }, [step]);

  function field<K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) { setForm(previous => ({ ...previous, [key]: value, ...(key === 'address' && previous.details.moving ? { details: { ...previous.details, moving: { ...previous.details.moving, origin: { ...previous.details.moving.origin, address: String(value) } } } } : {}) })); }
  function detail<K extends keyof QuoteForm['details']>(key: K, value: QuoteForm['details'][K]) { setForm(previous => ({ ...previous, details: { ...previous.details, [key]: value } })); }
  function selectProperty(value: string) { setSelectedProperty(value); const property = data?.properties?.find((item: any) => item.id === value); if (property) setForm(previous => ({ ...previous, address: property.address, area: property.area, postalCode: property.postal_code, details: { ...previous.details, access: property.details || '', ...(previous.details.moving ? { moving: { ...previous.details.moving, origin: { ...previous.details.moving.origin, address: property.address } } } : {}) } })); }
  function toggleService(service: string) {
    setForm(previous => {
      const services = previous.services.includes(service) ? previous.services.filter(value => value !== service) : [...previous.services, service];
      return { ...previous, services, frequency: services.length === 1 && services[0] === 'moving' ? 'One-time' : previous.frequency, details: { ...previous.details, ...(services.includes('moving') && !previous.details.moving ? { moving: { ...defaultMoving(), origin: { ...defaultMoving().origin, address: previous.address } } } : {}) } };
    });
  }
  function packageSelection(services: string[], plan: string) { setForm(previous => ({ ...previous, services, frequency: plan === 'annual' ? 'Mixed / help me choose' : plan === 'moving' ? 'One-time' : 'Seasonal', details: { ...previous.details, plan, ...(plan === 'moving' ? { moving: previous.details.moving || { ...defaultMoving(), origin: { ...defaultMoving().origin, address: previous.address } } } : {}) } })); }
  const snow = form.services.includes('snow'), estimate = snow ? snowEstimate(form.details.drivewaySize, form.details.salt) : null;
  const moving = form.services.includes('moving');
  const movingDraft = form.details.moving || defaultMoving();
  const movePlan: MovingDetails = { ...movingDraft, origin: { ...movingDraft.origin, address: form.address } };
  const moveTier = MOVING_TIERS.find(tier => tier.id === movePlan.tier) || MOVING_TIERS[1];
  function updateMoving(value: MovingDetails) { setForm(previous => ({ ...previous, address: value.origin.address, details: { ...previous.details, moving: value } })); }
  const selected = SERVICES.filter(service => form.services.includes(service.id));
  const filtered = SERVICES.filter(service => category === 'All services' || service.category === category);
  const accountReady = readiness?.accountsAvailable === true, bookingReady = readiness?.bookingAvailable === true;
  const requestText = [moving ? 'MOVING & PROPERTY CARE ENQUIRY — TRIOS SNOW AND MOWING INC.' : 'PROPERTY CARE ENQUIRY — TRIOS SNOW AND MOWING INC.', '', `Name: ${form.name || 'To be supplied'}`, `Email: ${form.email || 'To be supplied'}`, `Phone: ${form.phone || 'To be supplied'}`, `Property: ${form.address || 'To be supplied'}, ${form.area} ${form.postalCode}`, '', `Services: ${selected.map(service => service.name).join(', ') || 'To be selected'}`, `Frequency: ${form.frequency}`, `Preferred first visit: ${form.details.preferredDate || 'To be discussed'}`, ...(snow ? [`Winter season: ${SEASON}`, `Driveway: ${form.details.drivewaySize}; ${form.details.surface}; ${form.details.slope}`, `Salting quote: ${form.details.salt ? 'Yes' : 'No'}`, `Walkways: ${form.details.walkway ? 'Yes' : 'No'}`, `Priority requested: ${form.details.priority ? 'Yes' : 'No'}`, `Usual departure: ${form.details.departureTime || 'Not supplied'}`, `Snow placement: ${form.details.snowStorage || 'To be agreed'}`] : []), ...(form.details.lawnArea ? [`Lawn / garden area: ${form.details.lawnArea}`] : []), `Access notes: ${form.details.access || 'None supplied'}`, ...(moving ? ['', movingSummary(movePlan)] : []), '', 'This is a quote enquiry. No booking, price or payment is confirmed.'].join('\n');
  function downloadDraft() { const url = URL.createObjectURL(new Blob([requestText], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = moving ? 'trios-moving-enquiry.txt' : 'trios-property-care-enquiry.txt'; link.click(); URL.revokeObjectURL(url); }
  async function copyDraft() { try { await navigator.clipboard.writeText(requestText); toast.success('Enquiry details copied. Send them to Trios when you are ready.'); } catch { toast.error('Copy unavailable. Download your enquiry instead.'); } }
  function prepareSignIn() { try { sessionStorage.setItem('trios-quote-signin-handoff', JSON.stringify({ version: 2, email: form.email.trim().toLowerCase(), savedAt: Date.now(), form: { ...form, details: { ...form.details, photos: [] } } })); } catch {} }
  function resetDraft() { id.current = ''; setForm({ ...cleanForm(initial), name: data?.user?.name || '', email: data?.user?.email || '' }); setStep(0); setConsent(false); setSelectedProperty('choose'); setRestored(false); setError(''); setResetOpen(false); }
  async function submit() {
    if (!ready || formScope !== scope) return;
    if (!bookingReady) { setError('Online requests are not available. Download your enquiry or use the contact options below.'); return; }
    if (!data?.user) { setError('Sign in to securely submit your request.'); return; }
    if (moving) { const validation = movingSchema.safeParse(movePlan); if (!validation.success) { setError(validation.error.issues[0]?.message || 'Review your moving details before submitting.'); setStep(1); return; } }
    if (!consent) { setError('Please confirm the request statement before continuing.'); return; }
    if (busy) return;
    const currentLifecycle = lifecycle.current;
    setError(''); setBusy(true);
    try {
      if (!id.current) id.current = crypto.randomUUID();
      try { sessionStorage.setItem(draftPrefix + scope, JSON.stringify({ version: 2, scope, form, requestId: id.current, savedAt: Date.now() })); } catch {}
      const result = await saveData({ ...form, details: { ...form.details, moving: moving ? movePlan : undefined }, action: 'request', id: id.current, consent });
      if (currentLifecycle !== lifecycle.current || loadedScope.current !== scope) return;
      if (!result.ok || !result.id) throw Error('We could not confirm your request. Please refresh your account before trying again.');
      setSuccess(result.id);
      try { sessionStorage.removeItem(draftPrefix + scope); sessionStorage.removeItem('trios-quote-signin-handoff'); } catch {}
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    } catch (exception) { if (currentLifecycle === lifecycle.current) setError(exception instanceof Error ? exception.message : 'Could not submit. Please try again.'); }
    finally { if (currentLifecycle === lifecycle.current) setBusy(false); }
  }
  function next(event: React.FormEvent) { event.preventDefault(); setError(''); if (!form.services.length) { setError('Choose at least one service.'); return; } if (step === 1 && moving) { const validation = movingSchema.safeParse(movePlan); if (!validation.success) { setError(validation.error.issues[0]?.message || 'Complete the required moving details.'); stepHeading.current?.focus(); stepHeading.current?.scrollIntoView({ block: 'start' }); return; } } if (step < 2) setStep(step + 1); else void submit(); }

  if (!ready || formScope !== scope) return <div className="container section"><Loading/></div>;

  if (success) return <><Intro eyebrow="REQUEST RECEIVED" title="Leave the next step with us.">Your {moving ? 'moving' : 'property'} request has been saved securely.</Intro><div className="container page-body customer-upgrade"><div className="white-card customer-booking-success"><CheckCircle2 size={58}/><h2>Thanks, {form.name.split(' ')[0]}.</h2><p>Trios will review your {moving ? 'moving inventory, access details, transport request' : 'property, requested services'} and route availability. Your final quote and updates will appear in your account.</p><div className="summary-mini"><strong>TR-{success.slice(0, 8).toUpperCase()}</strong><p>{form.address}, {form.area}</p></div><ol className="customer-success-steps"><li><span>01</span><div><strong>{moving ? 'Moving scope review' : 'Property review'}</strong><p>Scope, access and route availability are checked.</p></div></li><li><span>02</span><div><strong>Your tailored quote</strong><p>Review the price and full terms in your account.</p></div></li><li><span>03</span><div><strong>{moving ? 'Move arranged' : 'Visits arranged'}</strong><p>Accept your quote and agree on scheduling.</p></div></li></ol><Notice>No payment has been taken. Your service date is confirmed after the quote and scheduling arrangements are agreed.</Notice><div className="button-row"><a className="button" href="/portal?tab=requests">View my request<ArrowRight size={18}/></a><a className="button outline" href="/services">Explore more care</a></div></div></div></>;

  return <><Intro eyebrow={moving ? "MOVING FORWARD, TOGETHER." : "YOUR PROPERTY. YOUR KIND OF CARE."} title={moving ? "Let’s plan your next chapter." : "Let’s make your day a little easier."}>Choose what you need, share the details, and review your tailored quote before work is confirmed.</Intro><div className="container page-body customer-upgrade">
    {readiness && !bookingReady && <CustomerContact body={step === 2 ? requestText : undefined} retry={retry}/>}
    <div className="customer-draft-bar"><div><CheckSquare size={18}/><span>{restored ? 'Your saved draft is restored. ' : ''}{draftState}<small>Your draft is not a submitted request.</small></span></div><div><button type="button" className="text-link" onClick={downloadDraft}><FileDown size={17}/>Download draft</button><button type="button" className="text-link" onClick={() => setResetOpen(true)}><RotateCcw size={16}/>Start over</button></div></div>
    <div className="stepper" aria-label="Quote request progress">{['Choose your services', moving ? 'Your moving plan' : 'Your property', 'Review & request'].map((label, index) => <div key={label} aria-current={step === index ? 'step' : undefined} className={'step' + (step >= index ? ' active' : '')}>{String(index + 1).padStart(2, '0')} / {label}</div>)}</div>
    <div className="booking-layout"><form className="white-card customer-booking-form" onSubmit={next}><p className="booking-progress" role="status">Step {step + 1} of 3</p><h2 ref={stepHeading} tabIndex={-1} className="section-title booking-step-heading">{step === 0 ? 'What can we take off your list?' : step === 1 ? 'The details make all the difference.' : 'Your plan, ready to review.'}</h2>{error && <div className="customer-inline-gap"><ErrorNotice message={error}/></div>}
      {step === 0 && <><div className="customer-booking-packages">{[[Snowflake, 'Winter care', ['snow'], 'winter'], [Leaf, 'Growing season', ['lawn', 'garden'], 'summer'], [Layers, 'Four-season care', ['snow', 'lawn', 'spring', 'fall'], 'annual'], [Layers, 'Moving services', ['moving'], 'moving']].map(([Icon, label, services, plan]: any) => <button type="button" key={plan} aria-pressed={form.details.plan === plan} onClick={() => packageSelection(services, plan)}><Icon size={23}/><strong>{label}</strong><span>Start with this plan</span></button>)}</div><div className="customer-service-filter"><span className="customer-kicker">OR CHOOSE INDIVIDUAL SERVICES</span><Pick label="Filter services by season" value={category} onChange={setCategory} options={['All services', 'Winter', 'Spring', 'Summer', 'Fall', 'Year-round']}/></div><p className="small-text muted">{form.services.length} service{form.services.length === 1 ? '' : 's'} selected across all seasons.</p><div className="choice-grid">{filtered.map(service => <label key={service.id} className="service-choice" data-selected={form.services.includes(service.id)} htmlFor={'service-' + service.id}><Checkbox id={'service-' + service.id} checked={form.services.includes(service.id)} onCheckedChange={() => toggleService(service.id)}/><div><strong>{service.name}</strong><p>{service.category} · {service.price}</p></div></label>)}</div>{!(moving && form.services.length === 1) && <div className="field customer-inline-gap"><label htmlFor="frequency">How often would you like help?</label><Pick id="frequency" label="Service frequency" value={form.frequency} onChange={value => field('frequency', value)} options={frequencies}/></div>}<Notice>You can combine services in one request. Assessment services are confirmed after scope and availability checks.</Notice></>}
      {step === 1 && <>{data?.properties?.length > 0 && <div className="field customer-inline-gap"><label htmlFor="saved-property">Use a saved property</label><Pick id="saved-property" label="Saved property" value={selectedProperty} onChange={selectProperty} options={[{ value: 'choose', label: 'Enter a new property' }, ...data.properties.map((property: any) => ({ value: property.id, label: property.label + ' · ' + property.address }))]}/></div>}<div className="form-grid"><label>Full name<input required minLength={2} value={form.name} maxLength={100} autoComplete="name" onChange={event => field('name', event.target.value)} placeholder="Your full name"/></label><label>Email<input required type="email" maxLength={200} autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={event => field('email', event.target.value)} placeholder="you@example.com"/></label><label>Phone<input required type="tel" minLength={7} maxLength={30} autoComplete="tel" value={form.phone} onChange={event => field('phone', event.target.value)} placeholder="709 000 0000"/></label><label>Postal code<input required autoComplete="postal-code" autoCapitalize="characters" spellCheck={false} pattern="[ABCEGHJ-NPRSTVXYabceghj-nprstvxy][0-9][ABCEGHJ-NPRSTVWXYZabceghj-nprstvwxyz][ -]?[0-9][ABCEGHJ-NPRSTVWXYZabceghj-nprstvwxyz][0-9]" value={form.postalCode} onChange={event => field('postalCode', event.target.value.toUpperCase())} maxLength={7} placeholder="A1A 1A1"/></label><label className="wide">{moving ? 'Pickup street address' : 'Street address'}<input required minLength={5} maxLength={250} autoComplete="street-address" value={form.address} onChange={event => field('address', event.target.value)} placeholder="Street number and street name"/></label><div className="field"><label htmlFor="area">Community</label><Pick id="area" label="Community" value={form.area} onChange={value => field('area', value)} options={AREAS}/></div>{!(moving && form.services.length === 1) && <label>Preferred first visit <span className="muted">(optional)</span><input type="date" min={customerToday()} value={form.details.preferredDate} onChange={event => detail('preferredDate', event.target.value)}/></label>}</div><p className="small-text muted">Your preferred date is a request. Trios confirms the date and arrival window after reviewing availability.</p>
        {moving && <MovingIntake value={movePlan} onChange={updateMoving} originAddress={form.address}/>}
        {snow && <><h3 className="section-title customer-inline-gap">Driveway & winter access</h3><div className="form-grid"><div className="field"><label htmlFor="drivewaySize">Driveway category</label><Pick id="drivewaySize" label="Driveway category" value={form.details.drivewaySize} onChange={value => detail('drivewaySize', value)} options={[{ value: '1', label: 'Single driveway' }, { value: '2', label: 'Double driveway' }, { value: '3', label: 'Triple driveway' }, { value: 'large', label: 'Larger / unsure' }]}/></div><div className="field"><label htmlFor="surface">Surface</label><Pick id="surface" label="Surface" value={form.details.surface} onChange={value => detail('surface', value)} options={['Paved', 'Concrete', 'Gravel', 'Interlocking', 'Other']}/></div><div className="field"><label htmlFor="slope">Slope</label><Pick id="slope" label="Slope" value={form.details.slope} onChange={value => detail('slope', value)} options={['Level', 'Slight slope', 'Steep slope']}/></div><label>Usual departure time <span className="muted">(optional)</span><input type="time" value={form.details.departureTime} onChange={event => detail('departureTime', event.target.value)}/></label><div className="wide customer-check-options">{[['salt', 'Include a salting quote'], ['walkway', 'Include walkways / steps'], ['priority', 'Request priority availability']].map(([key, label]) => <div className="checkbox-row" key={key}><Checkbox id={key} checked={form.details[key as 'salt' | 'walkway' | 'priority']} onCheckedChange={value => detail(key as 'salt' | 'walkway' | 'priority', value === true)}/><label htmlFor={key}>{label}</label></div>)}</div><label className="wide">Where can snow be placed?<textarea value={form.details.snowStorage} maxLength={1000} onChange={event => detail('snowStorage', event.target.value)} rows={3} placeholder="Describe available space within your property boundaries."/></label></div></>}
        {form.services.some(service => ['lawn', 'garden', 'aeration'].includes(service)) && <label className="customer-inline-gap">Approximate lawn / garden area<input value={form.details.lawnArea} maxLength={50} onChange={event => detail('lawnArea', event.target.value)} placeholder="e.g. 2,000 sq ft, or unsure"/></label>}<label className="customer-inline-gap">{moving ? 'Additional property-care notes' : 'Dimensions, access & anything we should know'}<textarea rows={5} value={form.details.access} onChange={event => detail('access', event.target.value)} maxLength={1500} placeholder={moving ? "Notes for any other requested services, pets, accessibility preferences or handover arrangements." : "Driveway length and width, gate width, parked cars, pets, steep areas, fragile edges or accessibility needs."}/><span className="customer-character-count">{form.details.access.length}/1,500 characters</span></label><div className="customer-inline-gap">{data?.user && readiness?.photosAvailable ? <UploadPhotos photos={form.details.photos} onChange={value => { if (loadedScope.current === scope) detail('photos', value); }}/> : <Notice>{data?.user ? 'Photo uploads are not available right now. Add a description and discuss photos with Trios.' : accountReady ? 'Sign in to add private property photos. You can complete the rest of your request first.' : 'You can discuss property photos with Trios when you call or email.'}</Notice>}</div></>}
      {step === 2 && <><div className="customer-review-block"><div className="section-head"><h3>{moving ? 'Your contact & pickup' : 'Your property & contact'}</h3><button type="button" className="text-link" onClick={() => setStep(1)}><Pencil size={16}/>Edit</button></div><dl><div><dt>Contact</dt><dd>{form.name}<br/>{form.email}<br/>{form.phone}</dd></div><div><dt>Property</dt><dd>{form.address}<br/>{form.area}, {form.postalCode}</dd></div><div><dt>Frequency</dt><dd>{form.frequency}</dd></div><div><dt>{moving ? 'Preferred moving date' : 'Preferred first visit'}</dt><dd>{moving ? (movePlan.moveDate ? niceDate(movePlan.moveDate) : 'To be discussed') : form.details.preferredDate ? niceDate(form.details.preferredDate) : 'To be discussed'}</dd></div></dl></div><div className="customer-review-block"><div className="section-head"><h3>Your requested care</h3><button type="button" className="text-link" onClick={() => setStep(0)}><Pencil size={16}/>Edit</button></div>{selected.map(service => <div key={service.id} className="customer-selected-service"><Check size={18}/><div><strong>{service.name}</strong><p>{service.scope}</p></div></div>)}{snow && <div className="summary-mini"><strong>Winter season: {SEASON}</strong><p>{form.details.drivewaySize === 'large' ? 'Larger driveway / assessment needed' : `${form.details.drivewaySize} driveway category`} · {form.details.surface} · {form.details.slope}</p><p>{[form.details.salt && 'Salting quote', form.details.walkway && 'Walkways / steps', form.details.priority && 'Priority request'].filter(Boolean).join(' · ') || 'No winter extras selected'}</p>{form.details.departureTime && <p>Usual departure: {form.details.departureTime}</p>}{form.details.snowStorage && <p>Snow placement: {form.details.snowStorage}</p>}</div>}{form.details.lawnArea && <p>Lawn / garden area: {form.details.lawnArea}</p>}{form.details.access && <div className="summary-mini"><strong>Access & care notes</strong><p className="customer-preserve-text">{form.details.access}</p></div>}{form.details.photos.length > 0 && <p>{form.details.photos.length} private property photo{form.details.photos.length === 1 ? '' : 's'} attached.</p>}</div>{moving && <MovingBrief value={movePlan}/>}<Notice>We review property dimensions, route capacity and requested timing before issuing a final quote. Reference pricing is not a final total.</Notice>
        {bookingReady ? <><div className="checkbox-row customer-inline-gap customer-consent"><Checkbox id="request-consent" checked={consent} onCheckedChange={value => setConsent(value === true)}/><label htmlFor="request-consent">I confirm these details are accurate and agree that Trios may use them to respond to this request. I understand this is a quote request, with no service or payment confirmed. <a href="/privacy" target="_blank" rel="noreferrer">Privacy information</a>.</label></div>{!data?.user && <div className="summary-mini"><p>Sign in with <strong>{form.email}</strong> to carry this draft into your account. Your details stay in this browser tab.</p><a className="button" target="_top" href="/sign-in?return_to=%2Fbook" onClick={prepareSignIn}>Sign in securely</a></div>}{accountError && <ErrorNotice message={accountError}/>}</> : <div className="customer-offline-enquiry"><h3>Your enquiry is ready to share.</h3><p>No request has been submitted. Download or copy these details, then contact Trios to discuss availability.</p>{moving && <p>For longer inventories, download the full enquiry and attach it to your email so every item reaches Trios.</p>}<div className="button-row"><button type="button" className="button" onClick={downloadDraft}><FileDown size={18}/>Download enquiry</button><button type="button" className="button outline" onClick={copyDraft}><Copy size={18}/>Copy details</button></div><CustomerContact compact body={requestText}/></div>}</>}
      <div className="button-row booking-step-actions">{step > 0 ? <button type="button" className="button outline" disabled={busy} onClick={() => { setStep(step - 1); setError(''); }}><ArrowLeft size={18}/>Back</button> : <span className="small-text muted">No payment required for a quote.</span>}{(step < 2 || bookingReady) && <button className="button" disabled={!ready || busy || (step === 2 && (!data?.user || !consent))}>{busy ? 'Saving request…' : step === 2 ? 'Submit quote request' : 'Continue'}<ArrowRight size={18}/></button>}</div>
    </form><aside className="white-card booking-summary"><span className="customer-kicker">YOUR CARE, AT A GLANCE</span><h3>{moving ? moveTier.name : form.details.plan === 'annual' ? 'Four-Season Care' : 'Your property plan'}</h3><div className="summary-details">{selected.length ? selected.map(service => <div key={service.id} className="summary-line"><span className="customer-summary-service"><ServiceIcon name={service.icon} size={19}/>{service.name}</span></div>) : <p>Choose a service to begin.</p>}</div>{moving && <div className="summary-mini"><strong>Moving · tailored written quote</strong><p>{moveTier.summary}</p><p>{movePlan.inventory.reduce((total, item) => total + item.quantity, 0)} listed items · {movePlan.boxCount} boxes</p><p>{movePlan.moveDate ? niceDate(movePlan.moveDate) : 'Moving date to be selected'}</p><p>Price, transport and availability are reviewed before confirmation.</p></div>}{snow && <div className="customer-inline-gap"><p className="small-text">Winter driveway reference</p><div className="customer-quote-total">{estimate === null ? 'To be quoted' : money(estimate)}</div><p className="small-text">For the 2026–27 season · {SEASON}</p></div>}{(!snow || form.services.length > 1 || form.details.walkway || form.details.priority) && <p className="small-text">Additional services and special access needs are priced in your final property quote.</p>}<div className="summary-mini"><ShieldCheck size={26}/><strong>No surprises in your scope.</strong><p>Review the final price, applicable tax and service terms before accepting.</p></div><div className="customer-booking-promises"><span><CheckCircle2 size={17}/>Clear written scope</span><span><CheckCircle2 size={17}/>Private property details</span><span><CheckCircle2 size={17}/>Scheduling by agreement</span></div><a className="text-link" href="/contact">Questions? We’re here to help<ArrowRight size={17}/></a></aside></div>
    <AlertDialog open={resetOpen} onOpenChange={setResetOpen}><AlertDialogContent><AlertDialogTitle>Start a fresh request?</AlertDialogTitle><AlertDialogDescription>This clears the draft in this browser tab. Previously submitted requests stay in your account.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep my draft</AlertDialogCancel><button className="button" onClick={resetDraft}>Start fresh</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></>;
}
