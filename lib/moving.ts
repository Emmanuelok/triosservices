import { z } from 'zod';
import { validDate } from './validation';

/** One source of truth for moving intake. A plan is a request for assessment, never a confirmed booking. */
export const MOVING_TIERS = [
  {
    id: 'help', name: 'Moving Help', eyebrow: 'An extra pair of hands',
    summary: 'Loading, unloading and agreed furniture placement when you arrange the transport.',
    includes: ['Agreed loading or unloading labour', 'Room-to-room furniture placement', 'A reviewed item and access plan', 'Move-day completion checklist'],
    boundary: 'You arrange a suitable vehicle and driver. Packing, transport, specialist items and assembly are excluded unless separately agreed in writing.',
  },
  {
    id: 'essentials', name: 'Local Essentials', eyebrow: 'A considered local move',
    summary: 'A coordinated local move for your prepared boxes and agreed furniture.',
    includes: ['Move inventory and access review', 'Agreed loading and unloading', 'Local transport coordination, subject to written confirmation', 'Furniture placement in the agreed rooms'],
    boundary: 'Transport, route, crew, date and price need a written quote. Pack boxes before arrival; packing materials, assembly and specialist handling are separately assessed.',
  },
  {
    id: 'pack', name: 'Pack & Move', eyebrow: 'More of the work taken care of',
    summary: 'Agreed packing support, a coordinated move and a clear room-by-room arrival plan.',
    includes: ['Everything agreed in Local Essentials', 'Packing support for the rooms and items in your quote', 'Box labelling and room planning', 'A reviewed packing-materials allowance'],
    boundary: 'Packing scope and materials must be itemised in the quote. Unpacking, disposal and specialist items are excluded unless separately agreed.',
  },
  {
    id: 'complete', name: 'Complete Transition', eyebrow: 'From moving out to settling in',
    summary: 'Packing, moving and agreed unpacking with property-care extras coordinated around your move.',
    includes: ['Everything agreed in Pack & Move', 'Agreed unpacking and room placement', 'A settling-in checklist', 'Coordination of separately quoted cleaning or property-care extras'],
    boundary: 'Choose the rooms and tasks to include. Cleaning, waste removal, assembly and every property-care extra require an agreed scope and separate line items; they are not automatically included.',
  },
] as const;

export const MOVING_ADDONS = [
  { id: 'packing', name: 'Packing support', description: 'Selected rooms or a reviewed whole-home packing scope.' },
  { id: 'materials', name: 'Packing materials', description: 'An itemised allowance for boxes, wrap and protective materials.' },
  { id: 'unpacking', name: 'Unpacking & placement', description: 'Agreed rooms unpacked, with belongings placed where instructed.' },
  { id: 'assembly', name: 'Basic furniture assembly', description: 'Selected freestanding furniture, subject to item and safety review.' },
  { id: 'cleaning', name: 'Move-out / move-in cleaning', description: 'Separately quoted cleaning coordinated with access and handover.' },
  { id: 'hauling', name: 'Approved item removal', description: 'An agreed non-hazardous item list with disposal arrangements confirmed.' },
  { id: 'property-care', name: 'Property-care handover', description: 'Coordinate separately quoted lawn, snow or seasonal care at either property.' },
  { id: 'extra-stop', name: 'Additional stop', description: 'A reviewed extra collection or delivery location in the written route.' },
] as const;

export const MOVE_TYPES = ['Home move', 'Apartment / condo', 'Student move', 'Downsizing', 'Office / small business', 'Loading / unloading only', 'Within-property move', 'Storage move'] as const;
export const MOVE_SIZES = ['A few items', 'Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4+ bedrooms', 'Small office', 'Custom / unsure'] as const;
export const MOVE_PROPERTY_TYPES = ['House', 'Apartment / condo', 'Townhouse', 'Office / commercial', 'Storage unit', 'Other / unsure'] as const;
export const MOVE_ELEVATORS = ['None', 'Available', 'Booking needed', 'Reserved'] as const;
export const MOVE_CARRY_DISTANCES = ['Under 15 m', '15–30 m', 'Over 30 m', 'Unsure'] as const;
export const MOVING_MAX_BYTES = 30_000;

const short = (max: number) => z.string().trim().max(max);
const tierSchema = z.enum(['help', 'essentials', 'pack', 'complete']);
const addonSchema = z.enum(['packing', 'materials', 'unpacking', 'assembly', 'cleaning', 'hauling', 'property-care', 'extra-stop']);
const addressSchema = z.object({
  address: short(250), unit: short(30), propertyType: short(60),
  floor: z.number().int().min(-3).max(100), stairs: z.number().int().min(0).max(100),
  elevator: z.enum(MOVE_ELEVATORS), parking: short(250),
  carryDistance: z.enum(MOVE_CARRY_DISTANCES), accessWindow: short(150),
});
const inventorySchema = z.object({
  id: z.string().uuid(), item: short(80), room: short(40), quantity: z.number().int().min(1).max(100),
  fragile: z.boolean(), heavy: z.boolean(), disassembly: z.boolean(), packed: z.boolean(), notes: short(160),
});
const draftObject = z.object({
  tier: tierSchema, moveType: z.enum(MOVE_TYPES), moveDate: z.union([z.literal(''), validDate]),
  flexible: z.boolean(), size: short(60), origin: addressSchema, destination: addressSchema,
  inventory: z.array(inventorySchema).max(60), boxCount: z.number().int().min(0).max(1000),
  transport: z.enum(['Customer arranged', 'Request transport']),
  addons: z.array(addonSchema).max(MOVING_ADDONS.length).refine(values => new Set(values).size === values.length, 'Choose each extra only once.'),
  specialItems: short(800), notes: short(1500),
});
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export const movingDraftSchema = draftObject;
export type MovingDetails = z.infer<typeof movingDraftSchema>;
export type MovingAddress = MovingDetails['origin'];
export type MovingInventoryItem = MovingDetails['inventory'][number];

export const movingSchema = movingDraftSchema.superRefine((value, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (byteLength(value) > MOVING_MAX_BYTES) issue([], 'Keep the moving plan under 30 KB. Shorten notes or reduce inventory lines.');
  if (!value.moveDate) issue(['moveDate'], 'Choose a preferred moving date. Availability is confirmed after review.');
  if (value.origin.address.length < 5) issue(['origin', 'address'], 'Enter the collection address.');
  if (value.destination.address.length < 5) issue(['destination', 'address'], 'Enter the destination address, or repeat the address for an on-site move.');
  if (!value.size) issue(['size'], 'Choose a move size, or select Custom / unsure.');
  if (value.inventory.length === 0 && value.boxCount === 0) issue(['inventory'], 'Add at least one item or an estimated box count.');
  const ids = new Set<string>();
  value.inventory.forEach((item, index) => {
    if (!item.item) issue(['inventory', index, 'item'], 'Name this inventory item.');
    if (ids.has(item.id)) issue(['inventory', index, 'id'], 'Each inventory line needs a unique identifier.');
    ids.add(item.id);
  });
  if (value.tier === 'help' && value.transport !== 'Customer arranged') issue(['transport'], 'Moving Help requires customer-arranged transport. Choose another tier to request transport.');
});

export function defaultMoving(tier?: string): MovingDetails {
  const selectedTier = tierSchema.safeParse(tier);
  const tierId = selectedTier.success ? selectedTier.data : 'essentials';
  const address = (): MovingAddress => ({ address: '', unit: '', propertyType: '', floor: 0, stairs: 0, elevator: 'None', parking: '', carryDistance: 'Unsure', accessWindow: '' });
  return { tier: tierId, moveType: 'Home move', moveDate: '', flexible: false, size: '', origin: address(), destination: address(), inventory: [], boxCount: 0, transport: tierId === 'help' ? 'Customer arranged' : 'Request transport', addons: [], specialItems: '', notes: '' };
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number, fallback = '') => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
function parsed<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T { const result = schema.safeParse(value); return result.success ? result.data : fallback; }

/** Restore only recognized, bounded draft fields. An incomplete draft is intentionally not submission-ready. */
export function cleanMoving(input: unknown): MovingDetails {
  const value = object(input), result = defaultMoving(typeof value.tier === 'string' ? value.tier : undefined);
  result.moveType = parsed(draftObject.shape.moveType, value.moveType, result.moveType);
  result.moveDate = parsed(draftObject.shape.moveDate, value.moveDate, '');
  result.flexible = value.flexible === true;
  result.size = text(value.size, 60);
  for (const key of ['origin', 'destination'] as const) {
    const source = object(value[key]), fallback = result[key];
    result[key] = {
      address: text(source.address, 250), unit: text(source.unit, 30), propertyType: text(source.propertyType, 60),
      floor: parsed(addressSchema.shape.floor, source.floor, 0), stairs: parsed(addressSchema.shape.stairs, source.stairs, 0),
      elevator: parsed(addressSchema.shape.elevator, source.elevator, fallback.elevator), parking: text(source.parking, 250),
      carryDistance: parsed(addressSchema.shape.carryDistance, source.carryDistance, fallback.carryDistance), accessWindow: text(source.accessWindow, 150),
    };
  }
  const ids = new Set<string>();
  if (Array.isArray(value.inventory)) for (const entry of value.inventory.slice(0, 60)) {
    const item = object(entry), id = inventorySchema.shape.id.safeParse(item.id);
    if (!id.success || ids.has(id.data)) continue;
    ids.add(id.data);
    result.inventory.push({ id: id.data, item: text(item.item, 80), room: text(item.room, 40), quantity: parsed(inventorySchema.shape.quantity, item.quantity, 1), fragile: item.fragile === true, heavy: item.heavy === true, disassembly: item.disassembly === true, packed: item.packed === true, notes: text(item.notes, 160) });
  }
  result.boxCount = parsed(draftObject.shape.boxCount, value.boxCount, 0);
  result.transport = result.tier === 'help' ? 'Customer arranged' : parsed(draftObject.shape.transport, value.transport, result.transport);
  if (Array.isArray(value.addons)) result.addons = Array.from(new Set(value.addons.flatMap(entry => { const addon = addonSchema.safeParse(entry); return addon.success ? [addon.data] : []; })));
  result.specialItems = text(value.specialItems, 800);
  result.notes = text(value.notes, 1500);
  // Preserve entered inventory. Oversized multi-byte drafts stay editable; submission validation
  // asks the customer to shorten the plan instead of silently deleting their belongings.
  return result;
}

export function movingReadiness(m: MovingDetails): { ready: boolean; missing: string[]; flags: string[]; itemCount: number } {
  const validation = movingSchema.safeParse(m);
  const missing = validation.success ? [] : Array.from(new Set(validation.error.issues.map(issue => issue.message)));
  const flags: string[] = [];
  if (m.transport === 'Request transport') flags.push('Transport, vehicle suitability and route require written confirmation.');
  for (const [name, location] of [['Collection', m.origin], ['Destination', m.destination]] as const) {
    if (!location.parking) flags.push(`${name}: confirm legal loading access and parking arrangements.`);
    if (location.stairs > 0) flags.push(`${name}: review ${location.stairs} flight${location.stairs === 1 ? '' : 's'} of stairs.`);
    if (location.elevator === 'Booking needed' || location.elevator === 'Available') flags.push(`${name}: confirm elevator permission, size and reservation.`);
    if (location.carryDistance === 'Over 30 m' || location.carryDistance === 'Unsure') flags.push(`${name}: review the carrying distance.`);
  }
  if (m.inventory.some(item => item.heavy || item.fragile) || m.specialItems.trim()) flags.push('Heavy, fragile or specialist items require a handling assessment and explicit acceptance.');
  if (m.inventory.some(item => item.disassembly) || m.addons.includes('assembly')) flags.push('Confirm which furniture can be safely disassembled or reassembled.');
  if (m.addons.includes('extra-stop')) flags.push('Provide the additional stop address and access details before the route is quoted.');
  if (m.moveType === 'Office / small business') flags.push('Agree downtime, building access and responsibility for IT and equipment preparation.');
  if (m.tier === 'help') flags.push('Customer-arranged transport and driver are required for Moving Help.');
  return { ready: validation.success, missing, flags, itemCount: m.inventory.reduce((total, item) => total + item.quantity, 0) + m.boxCount };
}

const locationSummary = (label: string, location: MovingAddress) => `${label}: ${location.address || 'To confirm'}${location.unit ? `, unit ${location.unit}` : ''}\n  ${location.propertyType || 'Property type to confirm'} · floor ${location.floor} · ${location.stairs} stair flights · elevator: ${location.elevator}\n  Parking: ${location.parking || 'To confirm'} · carry: ${location.carryDistance} · access: ${location.accessWindow || 'To confirm'}`;

export function movingSummary(m: MovingDetails): string {
  const tier = MOVING_TIERS.find(item => item.id === m.tier) || MOVING_TIERS[1];
  const inventory = m.inventory.map(item => `- ${item.quantity} × ${item.item || 'Unnamed item'}${item.room ? ` (${item.room})` : ''}${[item.fragile && 'fragile', item.heavy && 'heavy / specialist review', item.disassembly && 'disassembly requested', item.packed && 'packed'].filter(Boolean).length ? ` — ${[item.fragile && 'fragile', item.heavy && 'heavy / specialist review', item.disassembly && 'disassembly requested', item.packed && 'packed'].filter(Boolean).join(', ')}` : ''}${item.notes ? `; ${item.notes}` : ''}`);
  return [
    `MOVING PLAN — ${tier.name}`, `${m.moveType} · ${m.size || 'Size to confirm'}`,
    `Preferred date: ${m.moveDate || 'To confirm'}${m.flexible ? ' (flexible)' : ''} · ${m.transport}`,
    locationSummary('Collection', m.origin), locationSummary('Destination', m.destination),
    `Inventory (${m.inventory.reduce((total, item) => total + item.quantity, 0)} listed items, plus ${m.boxCount} estimated boxes):`,
    ...(inventory.length ? inventory : ['- No individual items listed']),
    `Requested extras: ${m.addons.map(id => MOVING_ADDONS.find(addon => addon.id === id)?.name).filter(Boolean).join(', ') || 'None selected'}`,
    `Special items: ${m.specialItems || 'None described'}`, `Move notes: ${m.notes || 'None'}`,
    `Scope: ${tier.boundary}`, 'This plan requests an assessment. Price, date, transport, staffing, item handling and extras are confirmed only in the written quote.',
  ].join('\n');
}
