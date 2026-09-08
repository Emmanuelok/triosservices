'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Layers } from 'lucide-react';
import { localToday } from '@/lib/validation';
import { MOVING_TIERS, MOVING_ADDONS, MOVE_TYPES, MOVE_PROPERTY_TYPES, cleanMoving, defaultMoving, movingReadiness, type MovingDetails } from '@/lib/moving';

const presets = [
  { item: 'Sofa', room: 'Living room', heavy: true },
  { item: 'Armchair', room: 'Living room' },
  { item: 'Bed frame', room: 'Bedroom', disassembly: true },
  { item: 'Mattress', room: 'Bedroom' },
  { item: 'Dresser', room: 'Bedroom', heavy: true },
  { item: 'Dining table', room: 'Dining room', disassembly: true },
  { item: 'Dining chair', room: 'Dining room' },
  { item: 'Desk', room: 'Office', disassembly: true },
  { item: 'Bookcase', room: 'Office' },
  { item: 'Television / monitor', room: 'Living room', fragile: true },
  { item: 'Appliance', room: 'Kitchen', heavy: true },
  { item: 'Mirror / framed artwork', room: 'Other', fragile: true },
];

function LocationFields({ label, value, onChange }: { label: string; value: MovingDetails['origin']; onChange: (value: MovingDetails['origin']) => void }) {
  const field = <K extends keyof MovingDetails['origin']>(key: K, next: MovingDetails['origin'][K]) => onChange({ ...value, [key]: next });
  return <fieldset className="move-location"><legend>{label}</legend><div className="move-fields">
    <label className="move-wide">Full address<input required minLength={5} maxLength={250} value={value.address} onChange={event => field('address', event.target.value)} autoComplete="off" placeholder="Street, community and postal code"/></label>
    <label>Unit / suite<input maxLength={30} value={value.unit} onChange={event => field('unit', event.target.value)} placeholder="If applicable"/></label>
    <label>Property type<select value={value.propertyType} onChange={event => field('propertyType', event.target.value)}><option value="">Select / discuss with Trios</option>{MOVE_PROPERTY_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
    <label>Floor number<input type="number" min={-3} max={100} value={value.floor} onChange={event => field('floor', Math.max(-3, Math.min(100, Number(event.target.value) || 0)))}/><span>Use 0 for ground level.</span></label>
    <label>Flights of stairs<input type="number" min={0} max={100} value={value.stairs} onChange={event => field('stairs', Math.max(0, Math.min(100, Number(event.target.value) || 0)))}/></label>
    <label>Elevator access<select value={value.elevator} onChange={event => field('elevator', event.target.value as MovingDetails['origin']['elevator'])}>{['None', 'Available', 'Booking needed', 'Reserved'].map(option => <option key={option}>{option}</option>)}</select></label>
    <label>Distance from loading area<select value={value.carryDistance} onChange={event => field('carryDistance', event.target.value as MovingDetails['origin']['carryDistance'])}>{['Under 15 m', '15–30 m', 'Over 30 m', 'Unsure'].map(option => <option key={option}>{option}</option>)}</select></label>
    <label className="move-wide">Parking / loading instructions<textarea rows={2} maxLength={250} value={value.parking} onChange={event => field('parking', event.target.value)} placeholder="Driveway, loading bay, parking restrictions or permit arrangements"/></label>
    <label className="move-wide">Building access window<input maxLength={150} value={value.accessWindow} onChange={event => field('accessWindow', event.target.value)} placeholder="e.g. Elevator reserved 10 am–noon, or to be arranged"/></label>
  </div></fieldset>;
}

export function MovingIntake({ value, onChange, originAddress }: { value: MovingDetails; onChange: (value: MovingDetails) => void; originAddress?: string }) {
  const [preset, setPreset] = useState(presets[0].item);
  const moving = { ...value, origin: { ...value.origin }, destination: { ...value.destination } };
  if (originAddress !== undefined) moving.origin = { ...moving.origin, address: originAddress };
  const readiness = movingReadiness(moving);
  const tier = MOVING_TIERS.find(item => item.id === moving.tier) || MOVING_TIERS[0];
  const set = <K extends keyof MovingDetails>(key: K, next: MovingDetails[K]) => onChange({ ...moving, [key]: next });
  const setTier = (id: MovingDetails['tier']) => {
    const defaults = defaultMoving(id);
    onChange({ ...moving, tier: defaults.tier, transport: defaults.transport });
  };
  function addItem(custom = false) {
    if (moving.inventory.length >= 60) return;
    const source = !custom ? presets.find(item => item.item === preset) : undefined;
    const existing = !custom && moving.inventory.find(item => item.item === source?.item && item.room === source?.room && !item.notes);
    if (existing) { set('inventory', moving.inventory.map(item => item.id === existing.id ? { ...item, quantity: Math.min(100, item.quantity + 1) } : item)); return; }
    set('inventory', [...moving.inventory, { id: crypto.randomUUID(), item: source?.item || '', room: source?.room || 'Other', quantity: 1, fragile: !!(source && 'fragile' in source && source.fragile), heavy: !!(source && 'heavy' in source && source.heavy), disassembly: !!(source && 'disassembly' in source && source.disassembly), packed: false, notes: '' }]);
  }
  function updateItem(id: string, changes: Partial<MovingDetails['inventory'][number]>) { set('inventory', moving.inventory.map(item => item.id === id ? { ...item, ...changes } : item)); }
  return <section className="moving-intake" aria-label="Moving quote planner">
    <div className="move-section-heading"><span className="move-kicker">YOUR NEXT CHAPTER, PLANNED</span><h3>Build your moving brief.</h3><p>Choose your support, map both locations and tell us what is coming with you. We review your details before confirming a written quote.</p></div>
    <fieldset className="move-tier-fieldset"><legend>1. Choose your level of support</legend><div className="move-tier-options">{MOVING_TIERS.map(option => <button key={option.id} className="move-tier-option" type="button" aria-pressed={moving.tier === option.id} onClick={() => setTier(option.id)}><span>{option.eyebrow}</span><strong>{option.name}</strong><p>{option.summary}</p><span className="move-tier-selection">{moving.tier === option.id ? <><CheckCircle2 size={19}/>Selected</> : 'Choose this tier'}</span></button>)}</div><div className="move-tier-inclusions"><strong>{tier.name} · scoped in your quote</strong><ul>{tier.includes.map(item => <li key={item}><Check size={18}/>{item}</li>)}</ul><p>{tier.boundary}</p></div></fieldset>
    <fieldset className="move-timing"><legend>2. Your move & timing</legend><div className="move-fields">
      <label>What kind of move?<select value={moving.moveType} onChange={event => set('moveType', event.target.value as MovingDetails['moveType'])}>{MOVE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>Size / space description<input required minLength={2} maxLength={60} value={moving.size} onChange={event => set('size', event.target.value)} placeholder="e.g. 2-bedroom apartment or 8 desks"/></label>
      <label>Preferred moving date<input type="date" required min={localToday()} value={moving.moveDate} onChange={event => set('moveDate', event.target.value)}/><span>Choose your best estimate; the final date is agreed after review.</span></label>
      <label>Transport arrangement<select value={moving.transport} disabled={moving.tier === 'help'} onChange={event => set('transport', event.target.value as MovingDetails['transport'])}><option>Customer arranged</option><option>Request transport</option></select><span>{moving.tier === 'help' ? 'Moving Help includes labour only.' : 'Any transport must be confirmed in the quote.'}</span></label>
      <label className="move-check move-wide"><input type="checkbox" checked={moving.flexible} onChange={event => set('flexible', event.target.checked)}/><span>My moving date is flexible / still being arranged.</span></label>
    </div></fieldset>
    <div className="move-section-heading"><h4>3. Where are we helping you move?</h4><p>Access at both ends affects the plan. For an in-home move or loading help, use the same address where appropriate.</p></div>
    <div className="move-location-grid"><LocationFields label="Pickup / starting point" value={moving.origin} onChange={next => set('origin', next)}/><LocationFields label="Destination / finishing point" value={moving.destination} onChange={next => set('destination', next)}/></div>
    <button type="button" className="text-link move-same-address" onClick={() => set('destination', { ...moving.origin })}>Use pickup details for the destination</button>
    <fieldset className="move-inventory"><legend>4. Your inventory</legend><p>Add your main furniture and items. Count ordinary boxes separately below. This is a planning list; specialist handling still needs review.</p><div className="move-inventory-toolbar"><label>Quick-add an item<select value={preset} onChange={event => setPreset(event.target.value)}>{presets.map(item => <option key={item.item}>{item.item}</option>)}</select></label><button type="button" className="button" disabled={moving.inventory.length >= 60} onClick={() => addItem()}>Add item</button><button type="button" className="button outline" disabled={moving.inventory.length >= 60} onClick={() => addItem(true)}>Add custom item</button></div>
      <p className="move-inventory-count" aria-live="polite"><Layers size={19}/>{moving.inventory.reduce((total, item) => total + item.quantity, 0)} furniture / individual items · {moving.inventory.length}/60 inventory lines</p>
      {!moving.inventory.length && <div className="move-empty"><strong>Every good move starts with a clear list.</strong><p>Add furniture or special items above. For a boxes-only move, enter the box count below.</p></div>}
      <div className="move-inventory-list">{moving.inventory.map((item, index) => <div className="move-inventory-item" key={item.id}><div className="move-item-heading"><strong>Item {index + 1}</strong><button className="text-link" type="button" onClick={() => set('inventory', moving.inventory.filter(entry => entry.id !== item.id))} aria-label={`Remove ${item.item || 'item ' + (index + 1)}`}>Remove</button></div><div className="move-fields"><label>Item name<input required minLength={2} maxLength={80} value={item.item} onChange={event => updateItem(item.id, { item: event.target.value })} placeholder="e.g. Solid wood cabinet"/></label><label>Room / zone<input maxLength={40} value={item.room} onChange={event => updateItem(item.id, { room: event.target.value })} placeholder="e.g. Bedroom 2 / office"/></label><label>Quantity<input type="number" required min={1} max={100} value={item.quantity} onChange={event => updateItem(item.id, { quantity: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })}/></label><label>Dimensions / handling notes<input maxLength={160} value={item.notes} onChange={event => updateItem(item.id, { notes: event.target.value })} placeholder="e.g. 180 × 90 cm; glass doors"/></label></div><div className="move-item-flags">{(['fragile', 'heavy', 'disassembly', 'packed'] as const).map(flag => <label className="move-check" key={flag}><input type="checkbox" checked={item[flag]} onChange={event => updateItem(item.id, { [flag]: event.target.checked })}/><span>{{ fragile: 'Fragile', heavy: 'Heavy / bulky', disassembly: 'Dismantling requested', packed: 'Already packed' }[flag]}</span></label>)}</div></div>)}</div>
      <label className="move-box-count">Estimated ordinary boxes<input type="number" min={0} max={1000} value={moving.boxCount} onChange={event => set('boxCount', Math.max(0, Math.min(1000, Number(event.target.value) || 0)))}/><span>Use 0 if no boxes are expected. Include unusual box sizes in your notes.</span></label>
    </fieldset>
    <fieldset className="move-addons"><legend>5. Add the support you need</legend><p>These are requests for assessment, not automatic inclusions or confirmed charges.</p><div className="move-addon-options">{MOVING_ADDONS.map(addon => <label className="move-addon" key={addon.id}><input type="checkbox" checked={moving.addons.includes(addon.id)} onChange={event => set('addons', event.target.checked ? [...moving.addons, addon.id] : moving.addons.filter(id => id !== addon.id))}/><span><strong>{addon.name}</strong><span>{addon.description}</span></span></label>)}</div><div className="move-fields"><label className="move-wide">Special items & handling needs<textarea rows={3} maxLength={800} value={moving.specialItems} onChange={event => set('specialItems', event.target.value)} placeholder="Tell us about unusual weights, fragile collections, restricted access or items that may need a specialist."/><span>Pianos, safes, hazardous goods, hoisting and trade disconnections are outside standard inclusions.</span></label><label className="move-wide">Anything else to plan around?<textarea rows={3} maxLength={1500} value={moving.notes} onChange={event => set('notes', event.target.value)} placeholder="Building rules, extra stops, accessibility preferences, priority rooms or dates to avoid."/></label></div></fieldset>
    <div className="move-readiness" aria-live="polite"><strong>{readiness.ready ? 'Your brief is ready for scope review.' : 'Let’s fill in the remaining details.'}</strong>{readiness.missing.length > 0 && <ul>{readiness.missing.map(item => <li key={item}>{item}</li>)}</ul>}{readiness.flags.length > 0 && <><p>For Trios to review:</p><ul>{readiness.flags.map(item => <li key={item}>{item}</li>)}</ul></>}<p>No price, crew, vehicle or moving date is confirmed by completing this form.</p></div>
  </section>;
}

function LocationBrief({ title, value }: { title: string; value: MovingDetails['origin'] }) {
  return <div className="move-brief-location"><h4>{title}</h4><p><strong>{value.address || 'Address to be supplied'}</strong>{value.unit && <><br/>Unit / suite {value.unit}</>}</p><dl><div><dt>Property</dt><dd>{value.propertyType || 'Property type to confirm'} · Floor {value.floor}</dd></div><div><dt>Stairs / elevator</dt><dd>{value.stairs} flights · {value.elevator}</dd></div><div><dt>Carry distance</dt><dd>{value.carryDistance}</dd></div><div><dt>Loading access</dt><dd>{value.parking || 'To be reviewed'}</dd></div><div><dt>Access window</dt><dd>{value.accessWindow || 'To be arranged'}</dd></div></dl></div>;
}

export function MovingBrief({ value }: { value: unknown }) {
  const moving = cleanMoving(value), readiness = movingReadiness(moving);
  const tier = MOVING_TIERS.find(item => item.id === moving.tier) || MOVING_TIERS[0];
  return <section className="moving-brief" aria-label="Moving request details"><div className="move-brief-heading"><span className="move-kicker">MOVING BRIEF</span><h3>{tier.name}</h3><p>{moving.moveType} · {moving.size || 'Size to be reviewed'}</p></div><div className="move-brief-facts"><div><span>Preferred date</span><strong>{moving.moveDate || 'To be arranged'}</strong><span>{moving.flexible ? 'Flexible timing' : 'Requested date'}</span></div><div><span>Transport</span><strong>{moving.transport}</strong><span>Subject to written scope</span></div><div><span>Inventory</span><strong>{moving.inventory.reduce((total, item) => total + item.quantity, 0)} listed items</strong><span>{moving.boxCount} ordinary boxes</span></div></div><div className="move-brief-locations"><LocationBrief title="Pickup" value={moving.origin}/><LocationBrief title="Destination" value={moving.destination}/></div>
    {!!moving.inventory.length && <details className="move-brief-inventory" open><summary>Item-by-item inventory ({moving.inventory.length} lines)</summary><ul>{moving.inventory.map(item => <li key={item.id}><div><strong>{item.quantity} × {item.item || 'Unnamed item'}</strong><span>{item.room}</span></div><p>{[item.fragile && 'Fragile', item.heavy && 'Heavy / bulky', item.disassembly && 'Dismantling requested', item.packed && 'Packed'].filter(Boolean).join(' · ') || 'Standard handling to be reviewed'}</p>{item.notes && <p>{item.notes}</p>}</li>)}</ul></details>}
    {!!moving.addons.length && <div className="move-brief-notes"><h4>Requested add-ons</h4><ul>{moving.addons.map(id => <li key={id}>{MOVING_ADDONS.find(addon => addon.id === id)?.name || id}</li>)}</ul></div>}{moving.specialItems && <div className="move-brief-notes"><h4>Special handling</h4><p>{moving.specialItems}</p></div>}{moving.notes && <div className="move-brief-notes"><h4>Planning notes</h4><p>{moving.notes}</p></div>}{!!readiness.flags.length && <div className="move-brief-notes"><h4>Scope review flags</h4><ul>{readiness.flags.map(flag => <li key={flag}>{flag}</li>)}</ul></div>}<p className="move-brief-boundary">{tier.boundary} Requested details are reviewed against the accepted written quote before work begins.</p></section>;
}
