import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trios-assistance-'));
await build({
  stdin: { contents: "export * from './lib/assistance'; export * from './lib/planner';", resolveDir: root, loader: 'ts' },
  outfile: path.join(temp, 'assistance.mjs'), bundle: true, platform: 'node', format: 'esm',
});
const api = await import(path.join(temp, 'assistance.mjs'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

const today = '2026-09-08';
const checks = snapshot => api.buildServiceAssistance(snapshot, { today });
const visit = (id, extra = {}) => ({ id, request_id: 'request-one', status: 'scheduled', service: 'lawn', scheduled_date: today, crew_id: 'crew-one', time_window: 'Afternoon', ...extra });
const invoice = (id, extra = {}) => ({ id, status: 'open', amount_cents: 10000, tax_cents: 1500, paid_cents: 0, due_date: today, ...extra });

test('untrusted service lists and property JSON cannot create unsupported recommendations', () => {
  assert.deepEqual(api.serviceIds('["snow","roof-work","snow",null,5,"lawn"]'), ['snow', 'lawn']);
  for (const value of [null, {}, 'broken JSON', '"snow"']) assert.deepEqual(api.serviceIds(value), []);
  assert.deepEqual(api.propertyDetails('{"access":"Side gate"}'), { access: 'Side gate' });
  for (const value of [null, [], 'not JSON', '[]', '"text"']) assert.deepEqual(api.propertyDetails(value), {});
});

test('calendar validation rejects rolled dates and local business days follow Newfoundland time', () => {
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-9-08', '', undefined]) assert.equal(api.isCalendarDate(value), false);
  assert.equal(api.isCalendarDate('2028-02-29'), true);
  assert.equal(api.localServiceDate(new Date('2026-09-08T01:00:00Z')), '2026-09-07');
  assert.equal(api.localServiceDate(new Date('2026-12-08T03:00:00Z')), '2026-12-07');
  assert.equal(api.localServiceDate(new Date('2026-12-08T04:00:00Z')), '2026-12-08');
  assert.throws(() => api.buildServiceAssistance({}, { today: '2026-02-29' }), /valid local calendar date/);
});

test('quote readiness asks for service-specific details without treating intake as approval', () => {
  const request = { id: 'intake', customer_name: 'Alex Sample', email: 'alex@example.com', phone: '7095551000', address: '12 Example Road', area: 'St. John’s', postal_code: 'A1A 1A1', frequency: 'Seasonal', services: ['snow', 'lawn'], details: { access: 'Side gate, 1 metre wide', drivewaySize: '2', snowStorage: 'Left side', surface: 'Paved', slope: 'Level', lawnArea: '2,000 sq ft' } };
  const complete = api.assessIntake(request);
  assert.equal(complete.percent, 100);
  assert.deepEqual(complete.missing, []);
  assert.match(complete.evidence.join(' '), /pricing and availability still need a human review/);
  const incomplete = api.assessIntake({ ...request, details: { ...request.details, priority: true, lawnArea: '' } });
  assert.deepEqual(incomplete.missing, ['Approximate lawn or garden area', 'Preferred departure time for priority review']);
  assert.ok(incomplete.percent < 100);
});

test('preparation covers the agreed service boundaries and never duplicates shared steps', () => {
  const steps = api.preparationSteps(['snow', 'walkways', 'lawn', 'garden', 'aeration', 'hauling']);
  assert.equal(new Set(steps).size, steps.length);
  assert.match(steps.join(' '), /underground features/);
  assert.match(steps.join(' '), /off-site disposal must be in the quote/);
  assert.match(steps.join(' '), /agreed response window/);
  assert.equal(api.preparationSteps(['unknown']).length, 1);
});

test('dispatch identifies overdue, unassigned, inactive and invalid-date work while excluding closed visits', () => {
  const results = checks({ crew: [{ id: 'inactive', active: false }], jobs: [
    visit('overdue', { scheduled_date: '2026-09-07' }), visit('unassigned', { crew_id: null }),
    visit('inactive', { crew_id: 'inactive' }), visit('invalid-date', { scheduled_date: '2026-02-30' }),
    visit('closed', { status: 'completed', scheduled_date: '2026-09-01' }), visit('cancelled', { status: 'cancelled', crew_id: null }),
  ] });
  const byId = Object.fromEntries(results.map(item => [item.id, item]));
  assert.equal(byId['dispatch:overdue'].priority, 'urgent');
  assert.equal(byId['dispatch:unassigned'].priority, 'review');
  assert.equal(byId['dispatch:inactive'].priority, 'urgent');
  assert.match(byId['dispatch:invalid-date'].evidence.join(' '), /missing or invalid/);
  assert.ok(!results.some(item => item.id.endsWith(':closed') || item.id.endsWith(':cancelled')));
  assert.ok(!byId['prep:invalid-date']);
});

test('accepted work needs a first visit only when no non-cancelled visit exists', () => {
  const requests = ['first', 'cancelled-only', 'completed', 'scheduled'].map(id => ({ id, status: 'accepted' }));
  const jobs = [visit('cancelled', { request_id: 'cancelled-only', status: 'cancelled' }), visit('done', { request_id: 'completed', status: 'completed' }), visit('upcoming', { request_id: 'scheduled' })];
  assert.deepEqual(checks({ requests, jobs }).filter(item => item.id.startsWith('accepted:')).map(item => item.action.recordId).sort(), ['cancelled-only', 'first']);
});

test('capacity checks count open visits per crew and day, with a truthful visit-count limit', () => {
  const jobs = [...Array.from({ length: 4 }, (_, index) => visit(`today-${index}`)), visit('tomorrow', { scheduled_date: '2026-09-09' }), visit('other-crew', { crew_id: 'crew-two' }), visit('completed', { status: 'completed' }), visit('cancelled', { status: 'cancelled' })];
  let results = checks({ jobs, settings: { dailyCapacity: 5 } }).filter(item => item.id.startsWith('capacity:'));
  assert.equal(results.length, 1);
  assert.equal(results[0].priority, 'review');
  assert.match(results[0].description, /4 open visits \/ 5 configured limit/);
  assert.match(results[0].evidence.join(' '), /travel time, task duration and weather are not estimated/);
  results = checks({ jobs, settings: { dailyCapacity: 3 } }).filter(item => item.id.startsWith('capacity:'));
  assert.equal(results[0].priority, 'urgent');
  assert.ok(!checks({ jobs, settings: { dailyCapacity: 0 } }).some(item => item.id.startsWith('capacity:')));
});

test('preparation uses approved access updates and only the next seven calendar days', () => {
  const results = checks({ jobs: [visit('today', { access_notes: 'Use the new side gate', details: '{"access":"Old driveway gate"}' }), visit('week', { scheduled_date: '2026-09-15' }), visit('later', { scheduled_date: '2026-09-16' })] });
  const preparations = results.filter(item => item.category === 'preparation');
  assert.equal(preparations.length, 2);
  assert.match(preparations[0].evidence.join(' '), /new side gate/);
  assert.doesNotMatch(preparations[0].evidence.join(' '), /Old driveway/);
  assert.ok(preparations.every(item => item.draft && item.action.tab === 'Schedule'));
});

test('payment follow-ups reconcile partial payments and distinguish overdue from approaching due dates', () => {
  const results = checks({ invoices: [invoice('partial', { status: 'partial', paid_cents: 5000, due_date: '2026-09-05' }), invoice('soon', { due_date: '2026-09-11' }), invoice('later', { due_date: '2026-09-12' }), invoice('settled', { status: 'paid', paid_cents: 11500 }), invoice('void', { status: 'void' })] });
  assert.equal(results.length, 2);
  const partial = results.find(item => item.id === 'invoice:partial');
  assert.match(partial.title, /3 days overdue.*65\.00 remaining/);
  assert.match(partial.draft, /65\.00 remaining/);
  assert.match(partial.draft, /already sent payment/);
  assert.equal(results.find(item => item.id === 'invoice:soon').priority, 'review');
});

test('invalid or contradictory invoice balances require record review and never produce a payment draft', () => {
  for (const values of [{ amount_cents: -1 }, { amount_cents: 1.1 }, { amount_cents: Number.MAX_SAFE_INTEGER, tax_cents: 1 }, { paid_cents: 11501 }, { amount_cents: undefined }]) assert.equal(api.invoiceBalance(invoice('invalid', values)), null);
  assert.equal(api.invoiceBalance(invoice('partial', { paid_cents: 5000 })), 6500);
  const results = checks({ invoices: [invoice('overpaid', { paid_cents: 12000 }), invoice('contradiction', { status: 'paid' }), invoice('missing-date', { due_date: '2026-02-30' })] });
  assert.equal(results.length, 3);
  assert.ok(results.every(item => item.priority === 'review' && !item.draft));
});

test('equipment checks surface passed dates and out-of-service assets without claiming physical condition', () => {
  const results = checks({ equipment: [
    { id: 'late', name: 'Snowblower', status: 'Ready', next_service: '2026-09-01' },
    { id: 'out', name: 'Mower', status: 'Out of service', next_service: '2027-01-01' },
    { id: 'soon', status: 'Ready', next_service: '2026-09-15' },
    { id: 'future', status: 'Ready', next_service: '2026-09-16' },
    { id: 'missing', status: 'Ready' },
  ] });
  assert.equal(results.length, 4);
  assert.equal(results.find(item => item.id === 'equipment:out').priority, 'urgent');
  assert.equal(results.find(item => item.id === 'equipment:late').priority, 'urgent');
  assert.ok(results.every(item => item.evidence.some(line => line.includes('Confirm condition'))));
});

test('crew assistance exposes only visit preparation and dispatch checks, without administrative drafts', () => {
  const snapshot = { jobs: [visit('late', { scheduled_date: '2026-09-07' }), visit('next')], requests: [{ id: 'pending', status: 'requested', email: 'private@example.com' }], invoices: [invoice('private-invoice')], equipment: [{ id: 'broken', status: 'Out of service' }] };
  const original = JSON.stringify(snapshot);
  const results = api.buildServiceAssistance(snapshot, { today, audience: 'crew' });
  assert.ok(results.length > 0);
  assert.ok(results.every(item => ['dispatch', 'preparation'].includes(item.category) && !item.draft));
  assert.doesNotMatch(JSON.stringify(results), /private@example|private-invoice|broken/);
  assert.equal(JSON.stringify(snapshot), original);
});

test('annual care suggestions span the seasons and explicit exclusions override the bundle', () => {
  assert.deepEqual(api.guidedPlan('An annual care plan').services, ['snow', 'lawn', 'spring', 'fall']);
  const plan = api.guidedPlan('An annual care plan, without snow clearing or lawn mowing. Add garden maintenance.');
  assert.deepEqual(plan.services, ['spring', 'fall', 'garden']);
  assert.equal(plan.mode, 'guided');
  assert.match(plan.reply, /No service date, payment or booking is confirmed/);
  assert.deepEqual(api.guidedPlan('Do not need snow clearing but I need lawn mowing.').services, ['lawn']);
});

test('planner keeps assessment and specialist boundaries explicit and never invents service availability', () => {
  const assessment = api.guidedPlan('I need pressure washing and gutters assessed');
  assert.deepEqual(assessment.services, ['washing', 'gutters']);
  assert.ok(assessment.recommendations.every(item => item.assessment));
  assert.match(assessment.reply, /not confirmed visits/);
  const specialist = api.guidedPlan('Can you do roof work, electrical repairs and pesticides?');
  assert.deepEqual(specialist.services, []);
  assert.match(specialist.reply, /outside routine Trios maintenance/);
  const snow = api.guidedPlan('Snow clearing with early morning priority');
  assert.match(snow.reply, /November 15, 2026/);
  assert.match(snow.reply, /route capacity/);
});

test('edited care plans hand off only supported unique service IDs and keep relevant quote questions', () => {
  const plan = api.buildPlanForServices(['lawn', 'lawn', 'unknown', 'snow']);
  assert.deepEqual(plan.services, ['lawn', 'snow']);
  assert.ok(plan.questions.some(question => question.includes('narrowest gate width')));
  assert.ok(plan.questions.some(question => question.includes('snow-placement space')));
  const url = new URL(api.carePlanBookingUrl(['snow', 'unknown', 'snow', 'lawn']), 'https://test.trios');
  assert.equal(url.pathname, '/book');
  assert.equal(url.searchParams.get('services'), 'snow,lawn');
  assert.equal(url.searchParams.get('plan'), 'care-planner');
  assert.equal(api.carePlanBookingUrl(['unknown']), '/book');
  assert.deepEqual(api.buildPlanForServices([]).questions, []);
});

test('moving intent produces a move plan without treating access or moving month as seasonal work', () => {
  for (const needs of ['I need movers for an apartment in winter, with stairs and a narrow driveway.', 'Moving my rental furniture this spring.', 'Move my sofa to a different apartment.', 'An office move in autumn with steps at the entrance.']) {
    const plan = api.guidedPlan(needs);
    assert.ok(plan.services.includes('moving'), needs);
    assert.ok(!plan.services.some(id => ['snow', 'walkways', 'spring', 'fall', 'furniture', 'cleaning'].includes(id)), needs);
    assert.match(plan.questions.join(' '), /both addresses/);
    assert.match(plan.reply, /customer-arranged transport/);
  }
  assert.ok(api.guidedPlan('Moving home and spring yard cleanup').services.includes('spring'));
  assert.ok(api.guidedPlan('Moving in winter with snow clearing for the driveway').services.includes('snow'));
  assert.ok(api.guidedPlan('Moving house and move-out cleaning').services.includes('cleaning'));
  assert.deepEqual(api.guidedPlan('Patio furniture setup and pack-away').services, ['furniture']);
  assert.ok(!api.guidedPlan('Lawn mowing without moving services').services.includes('moving'));
});

test('moving quote and dispatch assistance finds missing briefs and unusual handling needs', () => {
  const request = { id: 'move', services: ['moving'], details: {} };
  const readiness = api.assessIntake(request);
  for (const missing of ['Moving tier', 'Preferred moving date', 'Collection address', 'Destination address', 'Moving inventory or box count']) assert.ok(readiness.missing.includes(missing));
  const results = checks({ jobs: [visit('move', { service: 'moving', details: { moving: { tier: 'pack', specialItems: 'A heavy safe needs review.' } } })] });
  const review = results.find(item => item.id === 'move-review:move');
  assert.ok(review);
  assert.equal(review.priority, 'review');
  assert.match(review.evidence.join(' '), /transport|handling/);
  assert.ok(review.checklist.some(step => /both addresses/.test(step)));
  assert.ok(!checks({ jobs: [visit('closed-move', { service: 'moving', status: 'completed' })] }).some(item => item.id === 'move-review:closed-move'));
});
