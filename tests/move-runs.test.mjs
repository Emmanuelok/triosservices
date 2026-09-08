import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trios-move-runs-'));
const pg = new PGlite();
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
for (const filename of ['001_trios.sql', '002_service_changes.sql']) await pg.exec(fs.readFileSync(root + '/migrations/postgres/' + filename, 'utf8'));
// Simulate an installation with permissive default grants: the new migration must revoke them.
await pg.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA trios GRANT ALL ON TABLES TO anon, authenticated;');
await pg.exec(fs.readFileSync(root + '/migrations/postgres/003_moving.sql', 'utf8'));
const envKeys = ['DATABASE_URL', 'SITE_ORIGIN', 'OWNER_EMAILS'];
const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
Object.assign(process.env, { DATABASE_URL: 'postgres://local-test-only/secret', SITE_ORIGIN: 'https://test.trios', OWNER_EMAILS: 'owner@example.com' });
let begins = 0;
const executed = [];
globalThis.__movingPostgres = { async begin(work) {
  begins++;
  return pg.transaction(async tx => {
    const query = async strings => { const sql = strings.join(''); executed.push(sql); return tx.query(sql); };
    query.unsafe = async (sql, args) => { executed.push(sql); const result = await tx.query(sql, args); return Object.assign(result.rows, { count: result.affectedRows || 0 }); };
    return work(query);
  });
} };
const users = Object.fromEntries(['alice', 'bob', 'owner', 'crew', 'othercrew', 'inactive', 'impostor'].map(name => [name, { id: name, email: name + '@example.com', email_confirmed_at: '2026-09-08', user_metadata: name === 'impostor' ? { owner: true, role: 'admin' } : {} }]));
users.crew.email = 'CREW@example.com'; // Assignment matching is case-insensitive.
globalThis.__movingUser = users.owner;
const plugin = { name: 'real-moving-transaction-fixtures', setup(b) {
  b.onResolve({ filter: /^postgres$|^\.\/supabase\/server$|^\.\/private-storage$/ }, a => ({ path: a.path, namespace: 'moving-fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'moving-fixture' }, a => ({ loader: 'js', contents: a.path === 'postgres' ? 'export default function postgres(){return globalThis.__movingPostgres}' : a.path === './private-storage' ? 'export const privateStorage={}' : 'export async function verifiedUser(){return globalThis.__movingUser}' }));
} };
await build({ stdin: { contents: "export {GET,POST} from './app/api/moves/route'; export {database} from './lib/postgres-db'; export {defaultMoving} from './lib/moving'; export {MOVE_CHECKLIST,MOVE_STAGES} from './lib/move-runs';", resolveDir: root, loader: 'ts' }, outfile: temp + '/moves.mjs', bundle: true, platform: 'node', format: 'esm', plugins: [plugin], tsconfig: root + '/tsconfig.json' });
const api = await import(temp + '/moves.mjs');
const db = api.database;
const now = new Date().toISOString();
const crewIds = { crew: crypto.randomUUID(), othercrew: crypto.randomUUID(), inactive: crypto.randomUUID() };
for (const [name, id] of Object.entries(crewIds)) await db.prepare('INSERT INTO crew(id,name,email,active,created_at) VALUES (?,?,?,?,?)').bind(id, name, name + '@example.com', name === 'inactive' ? 0 : 1, now).run();
await db.prepare('INSERT INTO business_settings(id,value,updated_at) VALUES (?,?,?)').bind('operations', '{"dailyCapacity":100}', now).run();
const user = name => globalThis.__movingUser = name ? users[name] : null;
const row = (table, id) => db.prepare('SELECT * FROM ' + table + ' WHERE ' + (table === 'move_runs' ? 'job_id' : 'id') + '=?').bind(id).first();
const events = requestId => db.prepare("SELECT * FROM events WHERE request_id=? AND kind='move_progress' ORDER BY created_at,id").bind(requestId).all();
async function fixture(customer = 'alice', options = {}) {
  const requestId = crypto.randomUUID(), jobId = crypto.randomUUID();
  const moving = api.defaultMoving(options.tier);
  Object.assign(moving, { moveDate: '2099-10-24', size: '2 bedrooms', boxCount: 8, inventory: [
    { id: crypto.randomUUID(), item: 'Dining table', room: 'Dining room', quantity: 1, fragile: false, heavy: false, disassembly: true, packed: false, notes: 'Keep hardware together' },
    { id: crypto.randomUUID(), item: 'Dining chair', room: 'Dining room', quantity: 4, fragile: false, heavy: false, disassembly: false, packed: false, notes: '' },
  ] });
  moving.origin.address = customer === 'alice' ? '12 Alice Example Street' : '98 Bob Private Road';
  moving.destination.address = customer === 'alice' ? '25 Alice Sample Road' : '75 Bob Secret Lane';
  await db.prepare('INSERT INTO requests(id,user_id,customer_name,email,phone,address,area,postal_code,services,frequency,details,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(requestId, customer, customer, customer + '@example.com', '7090000000', moving.origin.address, 'St. John’s', 'A1A 1A1', JSON.stringify([options.service || 'moving']), 'One-time', JSON.stringify(options.invalidBrief ? { moving: {} } : { moving }), 'accepted', now, now).run();
  await db.prepare('INSERT INTO jobs(id,request_id,user_id,service,scheduled_date,time_window,crew_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(jobId, requestId, customer, options.service || 'moving', '2099-10-24', 'Morning', options.crewId === undefined ? crewIds.crew : options.crewId, options.status || 'scheduled', now).run();
  return { requestId, jobId, moving };
}
async function command(visit, overrides = {}) {
  const job = await row('jobs', visit.jobId), run = await row('move_runs', visit.jobId);
  return { jobId: visit.jobId, jobVersion: job.version, version: run?.version || 0, stage: run?.stage || 'planning', checklist: JSON.parse(run?.checklist || '[]'), checkedItems: JSON.parse(run?.checked_items || '[]'), transportPlan: run?.transport_plan || '', notes: run?.notes || '', ...overrides };
}
async function post(body, expected = 200, headers = { Origin: 'https://test.trios', 'Content-Type': 'application/json' }) {
  const response = await api.POST(new Request('https://test.trios/api/moves', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return result;
}
async function get(mode = '', expected = 200) {
  const response = await api.GET(new Request('https://test.trios/api/moves' + (mode ? '?mode=' + mode : '')));
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return result;
}
const transportPlan = 'Written quote confirms suitable transport, driver and agreed loading arrangements.';
async function progress(visit, end = 'completed') {
  user('owner');
  let result;
  for (const stage of api.MOVE_STAGES.slice(1)) {
    result = await post(await command(visit, { stage, checklist: [...api.MOVE_CHECKLIST], checkedItems: visit.moving.inventory.map(item => item.id), transportPlan }));
    if (stage === end) break;
  }
  return result;
}
after(async () => {
  await pg.close(); fs.rmSync(temp, { recursive: true, force: true });
  for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('private moving endpoints require identity, same-origin evidence and bounded valid commands', async () => {
  const visit = await fixture();
  const body = await command(visit);
  user(null); const start = begins;
  await get('', 401); await post(body, 401); assert.equal(begins, start);
  user('owner');
  for (const origin of ['https://attacker.test', 'null', undefined]) {
    const headers = { 'Content-Type': 'application/json' }; if (origin !== undefined) headers.Origin = origin;
    await post(body, 403, headers);
  }
  await post(body, 403, { Origin: 'https://test.trios', 'Sec-Fetch-Site': 'cross-site' });
  await post('{broken json', 400);
  await post({ ...body, notes: 'x'.repeat(17000) }, 413);
  await post({ ...body, jobVersion: -1 }, 400);
  await post({ ...body, checklist: ['access', 'access'] }, 400);
  await post({ ...body, checkedItems: [visit.moving.inventory[0].id, visit.moving.inventory[0].id] }, 400);
  await post({ ...body, stage: 'teleported' }, 400);
  assert.equal(begins, start);
});

test('customers, unassigned crew, inactive crew and editable metadata cannot authorize mutations', async () => {
  const visit = await fixture(), inactive = await fixture('alice', { crewId: crewIds.inactive }), otherService = await fixture('alice', { service: 'lawn' });
  for (const name of ['alice', 'bob', 'othercrew', 'impostor']) { user(name); await post(await command(visit), 403); }
  user('inactive'); await post(await command(inactive), 403);
  user('owner'); await post(await command(otherService), 403);
  assert.equal(await row('move_runs', visit.jobId), null);
  user('crew'); await post(await command(visit, { notes: 'Assigned crew reviewed the brief.' }));
  assert.equal((await row('move_runs', visit.jobId)).updated_by, 'CREW@example.com');
});

test('GET scopes records to the signed-in customer or active assigned crew, with explicit owner workspaces', async () => {
  const alice = await fixture(), bob = await fixture('bob', { crewId: crewIds.othercrew });
  user('owner'); await post(await command(alice, { notes: 'Alice move notes' })); await post(await command(bob, { notes: 'Bob private move notes' }));
  user('alice'); await get('admin', 403); await get('crew', 403); await get('invalid', 400);
  const customer = await get();
  assert.ok(customer.runs.some(run => run.job_id === alice.jobId));
  assert.ok(!customer.runs.some(run => run.job_id === bob.jobId));
  assert.ok(!JSON.stringify(customer).includes('Bob private'));
  for (const run of customer.runs) { assert.ok(!('updated_by' in run)); assert.ok(!('user_id' in run)); assert.ok(!('crew_email' in run)); }
  user('crew'); const crew = await get('crew');
  assert.ok(crew.runs.some(run => run.job_id === alice.jobId)); assert.ok(!crew.runs.some(run => run.job_id === bob.jobId));
  assert.deepEqual((await get()).runs, []);
  user('inactive'); await get('crew', 403);
  user('owner'); assert.deepEqual((await get()).runs, []);
  for (const mode of ['admin', 'crew']) { const business = await get(mode); assert.ok(business.runs.some(run => run.job_id === alice.jobId)); assert.ok(business.runs.some(run => run.job_id === bob.jobId)); }
});

test('run and visit versions reject stale writes, and reassignment immediately removes former crew access', async () => {
  const visit = await fixture(); user('crew');
  const initial = await command(visit);
  const saved = await post(initial); assert.equal(saved.run.version, 1); assert.equal(saved.jobVersion, 0);
  await post({ ...initial, notes: 'Stale overwrite' }, 409);
  assert.equal((await row('move_runs', visit.jobId)).notes, '');
  await db.prepare('UPDATE jobs SET access_notes=?,version=? WHERE id=?').bind('A newly reviewed loading entrance.', 1, visit.jobId).run();
  await post(await command(visit, { jobVersion: 0, notes: 'Ignore new access' }), 409);
  await post(await command(visit, { notes: 'Latest access reviewed' }));
  await db.prepare('UPDATE jobs SET crew_id=?,version=? WHERE id=?').bind(crewIds.othercrew, 2, visit.jobId).run();
  await post(await command(visit, { notes: 'Former assignment must fail' }), 403);
  assert.ok(!(await get('crew')).runs.some(run => run.job_id === visit.jobId));
  user('othercrew'); await post(await command(visit, { notes: 'Reassigned crew has the current brief' }));
  assert.equal((await row('move_runs', visit.jobId)).notes, 'Reassigned crew has the current brief');
});

test('transport confirmation is owner-only, required before readiness and locked after loading starts', async () => {
  const visit = await fixture(); user('crew');
  await post(await command(visit, { transportPlan }), 403);
  await post(await command(visit, { stage: 'ready' }), 409);
  user('owner'); await post(await command(visit, { stage: 'ready', transportPlan: 'To confirm' }), 409);
  await post(await command(visit, { stage: 'ready', transportPlan }));
  user('crew'); await post(await command(visit, { notes: 'Confirmed transport reviewed' }));
  await post(await command(visit, { stage: 'loading', checklist: ['access', 'inventory', 'protection'] }));
  user('owner'); await post(await command(visit, { transportPlan: transportPlan + ' Changed vehicle.' }), 409);
  assert.equal((await row('move_runs', visit.jobId)).transport_plan, transportPlan);
  const help = await fixture('alice', { tier: 'help' }); user('crew');
  await post(await command(help, { stage: 'ready' }));
  assert.equal((await row('move_runs', help.jobId)).transport_plan, '');
});

test('stages cannot skip or reverse and each operational stage enforces its required checklist', async () => {
  const visit = await fixture(); user('owner');
  await post(await command(visit, { stage: 'loading', transportPlan, checklist: [...api.MOVE_CHECKLIST] }), 409);
  await post(await command(visit, { stage: 'ready', transportPlan }));
  await post(await command(visit, { stage: 'planning' }), 409);
  for (const checklist of [[], ['access'], ['access', 'inventory']]) await post(await command(visit, { stage: 'loading', checklist }), 409);
  const load = await post(await command(visit, { stage: 'loading', checklist: ['access', 'inventory', 'protection'] }));
  assert.equal(load.jobVersion, 1); assert.equal((await row('jobs', visit.jobId)).status, 'in_progress');
  await post(await command(visit, { stage: 'delivery' }), 409);
  await post(await command(visit, { stage: 'delivery', checklist: ['access', 'inventory', 'protection', 'load'] }));
  await post(await command(visit, { stage: 'walkthrough' }), 409);
  await post(await command(visit, { stage: 'walkthrough', checklist: ['access', 'inventory', 'protection', 'load', 'arrival'] }));
  await post(await command(visit, { stage: 'completed' }), 409);
  await post(await command(visit, { stage: 'completed', checklist: [...api.MOVE_CHECKLIST] }), 409);
  assert.equal((await row('jobs', visit.jobId)).status, 'in_progress');
});

test('inventory identifiers must belong to this move and invalid briefs fail closed', async () => {
  const first = await fixture(), second = await fixture(), invalid = await fixture('alice', { invalidBrief: true }); user('owner');
  await post(await command(first, { checkedItems: [second.moving.inventory[0].id] }), 400);
  await post(await command(invalid), 409);
  assert.equal(await row('move_runs', first.jobId), null); assert.equal(await row('move_runs', invalid.jobId), null);
  await progress(first, 'walkthrough');
  await post(await command(first, { stage: 'completed', checkedItems: [first.moving.inventory[0].id] }), 409);
  assert.equal((await row('move_runs', first.jobId)).stage, 'walkthrough');
});

test('completion atomically closes the job, preserves existing work records and adds only stage events', async () => {
  const visit = await fixture(); user('owner');
  await db.prepare('UPDATE jobs SET notes=?,labour_minutes=?,cost_cents=?,photos=? WHERE id=?').bind('Pre-existing customer-visible job note.', 120, 6000, '[]', visit.jobId).run();
  await post(await command(visit, { notes: 'Planning note, no stage notification' }));
  assert.equal((await events(visit.requestId)).results.length, 0);
  await progress(visit, 'walkthrough');
  await post(await command(visit, { notes: 'Customer walkthrough completed; no exceptions.' }));
  assert.equal((await events(visit.requestId)).results.length, 4);
  const finalCommand = await command(visit, { stage: 'completed' }), start = begins;
  const result = await post(finalCommand);
  assert.equal(begins, start + 1); assert.equal(result.jobVersion, 2); assert.equal(result.run.stage, 'completed');
  const job = await row('jobs', visit.jobId), run = await row('move_runs', visit.jobId);
  assert.equal(job.status, 'completed'); assert.equal(job.version, 2); assert.ok(job.completed_at);
  assert.equal(job.notes, 'Pre-existing customer-visible job note.'); assert.equal(job.labour_minutes, 120); assert.equal(job.cost_cents, 6000);
  assert.equal(run.stage, 'completed'); assert.equal(run.version, result.run.version); assert.equal(run.updated_at, job.completed_at);
  const history = (await events(visit.requestId)).results;
  assert.equal(history.length, 5); assert.ok(history.every(event => event.user_id === 'alice'));
  assert.equal(history.filter(event => event.body.includes('recorded: completed.')).length, 1);
  assert.ok(executed.some(sql => sql.includes("pg_advisory_xact_lock(hashtext('trios-write'))")));
  await post({ ...finalCommand, jobVersion: 2, version: run.version }, 409);
});

test('a PostgreSQL event failure rolls back run completion and job completion together', async () => {
  const visit = await fixture(); await progress(visit, 'walkthrough');
  const beforeJob = await row('jobs', visit.jobId), beforeRun = await row('move_runs', visit.jobId), beforeEvents = (await events(visit.requestId)).results.length;
  // Generated UUID is fixture-owned; the constraint fails only this completion event.
  await pg.exec(`ALTER TABLE trios.events ADD CONSTRAINT moving_completion_failure CHECK (NOT (request_id='${visit.requestId}' AND kind='move_progress' AND body LIKE '%recorded: completed.%'));`);
  try {
    await post(await command(visit, { stage: 'completed' }), 500);
    assert.deepEqual(await row('jobs', visit.jobId), beforeJob);
    assert.deepEqual(await row('move_runs', visit.jobId), beforeRun);
    assert.equal((await events(visit.requestId)).results.length, beforeEvents);
  } finally { await pg.exec('ALTER TABLE trios.events DROP CONSTRAINT moving_completion_failure;'); }
  await post(await command(visit, { stage: 'completed' }));
  assert.equal((await row('jobs', visit.jobId)).status, 'completed');
});

test('closed and cancelled moves cannot be edited and generic job completion cannot bypass the manifest', async () => {
  const cancelled = await fixture('alice', { status: 'cancelled' }), ordinary = await fixture(); user('owner');
  await post(await command(cancelled), 409);
  await assert.rejects(db.prepare('UPDATE jobs SET status=?,version=? WHERE id=?').bind('completed', 1, ordinary.jobId).run(), /move_checklist_required/);
  assert.equal((await row('jobs', ordinary.jobId)).status, 'scheduled'); assert.equal(await row('move_runs', ordinary.jobId), null);
  await assert.rejects(fixture('alice', { status: 'completed' }), /move_checklist_required/);
  await post(await command(ordinary));
  const run = await row('move_runs', ordinary.jobId);
  await assert.rejects(db.prepare('UPDATE move_runs SET version=? WHERE job_id=?').bind(run.version, ordinary.jobId).run(), /stale_move/);
  await progress(ordinary);
  await assert.rejects(db.prepare('UPDATE move_runs SET version=?,notes=? WHERE job_id=?').bind((await row('move_runs', ordinary.jobId)).version + 1, 'Closed row overwrite', ordinary.jobId).run(), /closed_move/);
  assert.notEqual((await row('move_runs', ordinary.jobId)).notes, 'Closed row overwrite');
});

test('the move table and trigger functions deny direct client-role access even with permissive default grants', async () => {
  const metadata = await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='trios.move_runs'::regclass");
  assert.equal(metadata.rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const grant = await pg.query('SELECT has_table_privilege($1,$2,$3) AS permitted', [role, 'trios.move_runs', privilege]);
      assert.equal(grant.rows[0].permitted, false, role + ' ' + privilege);
    }
    for (const fn of ['trios.guard_move_run()', 'trios.guard_move_completion()']) {
      const grant = await pg.query('SELECT has_function_privilege($1,$2,$3) AS permitted', [role, fn, 'EXECUTE']);
      assert.equal(grant.rows[0].permitted, false, role + ' ' + fn);
    }
  }
  // Even an accidental future SELECT grant cannot expose rows without an explicit policy.
  await pg.exec('GRANT USAGE ON SCHEMA trios TO authenticated; GRANT SELECT ON trios.move_runs TO authenticated;');
  try {
    const result = await pg.transaction(async tx => { await tx.exec('SET LOCAL ROLE authenticated'); return tx.query('SELECT * FROM trios.move_runs'); });
    assert.deepEqual(result.rows, []);
  } finally { await pg.exec('REVOKE SELECT ON trios.move_runs FROM authenticated; REVOKE USAGE ON SCHEMA trios FROM authenticated;'); }
});
