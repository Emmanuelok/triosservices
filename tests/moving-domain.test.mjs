import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trios-moving-'));
await build({
  stdin: { contents: "export * from './lib/moving';", resolveDir: root, loader: 'ts' },
  outfile: path.join(temp, 'moving.mjs'), bundle: true, platform: 'node', format: 'esm',
});
const api = await import(path.join(temp, 'moving.mjs'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const uuid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const line = (n = 1, extra = {}) => ({ id: uuid(n), item: 'Dining chair', room: 'Dining room', quantity: 4, fragile: false, heavy: false, disassembly: false, packed: false, notes: '', ...extra });
const plan = (extra = {}) => {
  const move = api.defaultMoving();
  return { ...move, moveDate: '2026-10-24', size: '2 bedrooms', origin: { ...move.origin, address: '12 Example Street' }, destination: { ...move.destination, address: '25 Sample Road' }, inventory: [line()], ...extra };
};

test('tiers share stable IDs and distinguish customer transport from quote-confirmed transport', () => {
  assert.deepEqual(api.MOVING_TIERS.map(tier => tier.id), ['help', 'essentials', 'pack', 'complete']);
  assert.equal(api.defaultMoving('help').transport, 'Customer arranged');
  assert.equal(api.defaultMoving('complete').transport, 'Request transport');
  assert.equal(api.defaultMoving('invented').tier, 'essentials');
  const draft = api.defaultMoving();
  assert.equal(api.movingDraftSchema.safeParse(draft).success, true);
  assert.equal(api.movingSchema.safeParse(draft).success, false);
  draft.origin.address = 'One address';
  assert.equal(draft.destination.address, '');
  const invalidHelp = plan({ tier: 'help', transport: 'Request transport' });
  assert.equal(api.movingSchema.safeParse(invalidHelp).success, false);
  assert.equal(api.cleanMoving(invalidHelp).transport, 'Customer arranged');
});

test('submission requires real dates, two locations, a declared size and a meaningful load', () => {
  assert.equal(api.movingSchema.safeParse(plan()).success, true);
  for (const moveDate of ['', '2026-02-29', '2026-04-31', '2026-9-8']) assert.equal(api.movingSchema.safeParse(plan({ moveDate })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ moveDate: '2028-02-29' })).success, true);
  assert.equal(api.movingSchema.safeParse(plan({ size: '' })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ destination: api.defaultMoving().destination })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ inventory: [], boxCount: 0 })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ inventory: [], boxCount: 12 })).success, true);
  assert.equal(api.movingSchema.safeParse(plan({ inventory: [line(1, { item: '  ' })], boxCount: 12 })).success, false);
});

test('inventory and extras reject duplicate IDs, unsupported options and invalid quantities', () => {
  assert.equal(api.movingSchema.safeParse(plan({ inventory: [line(), line()] })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ inventory: [line(1, { id: 'not-a-uuid' })] })).success, false);
  for (const quantity of [0, -1, 1.2, 101, Infinity, '2']) assert.equal(api.movingSchema.safeParse(plan({ inventory: [line(1, { quantity })] })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ inventory: Array.from({ length: 61 }, (_, i) => line(i)) })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ addons: ['packing', 'packing'] })).success, false);
  assert.equal(api.movingSchema.safeParse(plan({ addons: ['insurance-guarantee'] })).success, false);
});

test('draft restoration isolates recognized fields and bounds invalid or hostile input', () => {
  for (const value of [undefined, null, '', 10, [], '{bad json']) assert.deepEqual(api.cleanMoving(value), api.defaultMoving());
  const cleaned = api.cleanMoving({ ...plan(), tier: 'pack', privileged: true, origin: { ...plan().origin, floor: '5', address: 'x'.repeat(400), password: 'secret' }, inventory: [line(1), line(1), line(2, { id: 'bad' }), line(3, { quantity: -5, privileged: true })], addons: ['packing', 'packing', 'unsupported'], boxCount: -2 });
  assert.equal(api.movingDraftSchema.safeParse(cleaned).success, true);
  assert.equal(cleaned.origin.address.length, 250);
  assert.equal(cleaned.origin.floor, 0);
  assert.equal(cleaned.inventory.length, 2);
  assert.equal(cleaned.inventory[1].quantity, 1);
  assert.deepEqual(cleaned.addons, ['packing']);
  assert.equal(cleaned.boxCount, 0);
  assert.equal('privileged' in cleaned, false);
  assert.equal('password' in cleaned.origin, false);
  assert.equal('privileged' in cleaned.inventory[1], false);
});

test('oversized UTF-8 drafts preserve inventory and cannot be submitted until reduced', () => {
  const large = plan({ inventory: Array.from({ length: 60 }, (_, i) => line(i, { item: '界'.repeat(80), room: '界'.repeat(40), notes: '界'.repeat(160) })), specialItems: '界'.repeat(800), notes: '界'.repeat(1500) });
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).length > api.MOVING_MAX_BYTES);
  assert.equal(api.movingSchema.safeParse(large).success, false);
  const cleaned = api.cleanMoving(large);
  assert.equal(api.movingDraftSchema.safeParse(cleaned).success, true);
  assert.equal(cleaned.inventory.length, 60);
  assert.equal(api.movingSchema.safeParse(cleaned).success, false);
  assert.ok(api.movingReadiness(cleaned).missing.some(message => message.includes('30 KB')));
});

test('readiness separates a valid quote request from operational review flags', () => {
  const move = plan({ moveType: 'Office / small business', inventory: [line(1, { fragile: true, disassembly: true, quantity: 2 })], boxCount: 5, addons: ['extra-stop'] });
  move.origin.stairs = 2;
  move.destination.elevator = 'Booking needed';
  const state = api.movingReadiness(move);
  assert.equal(state.ready, true);
  assert.equal(state.itemCount, 7);
  assert.deepEqual(state.missing, []);
  for (const text of ['written confirmation', '2 flights', 'elevator', 'specialist', 'disassembled', 'additional stop', 'downtime']) assert.ok(state.flags.some(flag => flag.includes(text)), text);
  assert.equal(api.movingReadiness(api.defaultMoving()).ready, false);
  assert.ok(api.movingReadiness(api.defaultMoving()).missing.length >= 5);
});

test('shareable summary carries inventory, both access plans and written-quote boundaries', () => {
  const move = plan({ tier: 'complete', addons: ['cleaning', 'unpacking'], boxCount: 8, inventory: [line(1, { notes: 'Keep the set together', fragile: true })], notes: 'Collect keys at reception' });
  move.destination.unit = '4B';
  move.origin.parking = 'Review the loading zone';
  const summary = api.movingSummary(move);
  for (const value of ['Complete Transition', '12 Example Street', '25 Sample Road, unit 4B', '4 × Dining chair', '8 estimated boxes', 'fragile', 'Keep the set together', 'Review the loading zone', 'Move-out / move-in cleaning', 'Collect keys at reception', 'confirmed only in the written quote']) assert.ok(summary.includes(value), value);
  assert.doesNotMatch(summary, /\$\d|insured fleet|guaranteed arrival|licence-free/i);
});
