import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, after, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trios-moving-isolation-'));
let current;
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const harnesses = new Set(), requests = [], listeners = new Map();
class Harness {
  states = []; refs = []; callbacks = []; effects = []; pending = [];
  constructor(component, props) { this.component = component; this.props = props; harnesses.add(this); }
  render(props = this.props) { this.props = props; this.si = this.ri = this.ci = this.ei = 0; this.pending = []; current = this; try { return this.tree = this.component(props); } finally { current = null; } }
  flushEffects() { for (const run of this.pending) run(); this.pending = []; }
  unmount() { for (const effect of this.effects) effect?.cleanup?.(); this.effects = []; harnesses.delete(this); }
}
globalThis.__movingHooks = {
  useState(initial) { const h = current, i = h.si++; if (!(i in h.states)) h.states[i] = typeof initial === 'function' ? initial() : initial; return [h.states[i], next => h.states[i] = typeof next === 'function' ? next(h.states[i]) : next]; },
  useRef(initial) { return current.refs[current.ri++] ??= { current: initial }; },
  useCallback(fn, deps) { const h = current, i = h.ci++, old = h.callbacks[i]; if (!old || !same(old.deps, deps)) h.callbacks[i] = { fn, deps }; return h.callbacks[i].fn; },
  useEffect(fn, deps) { const h = current, i = h.ei++, old = h.effects[i]; if (!old || !same(old.deps, deps)) h.pending.push(() => { old?.cleanup?.(); h.effects[i] = { deps, cleanup: fn() }; }); },
};
globalThis.window = { setTimeout, clearTimeout,
  addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
};
function signout() { for (const fn of [...(listeners.get('trios:signout') || [])]) fn(); }
globalThis.fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve(value) { this.done = true; resolve(value); }, reject(error) { this.done = true; reject(error); }, done: false }));
await build({ stdin: { contents: "export {MovingWorkspace} from './components/moving-workspace'; export {defaultMoving} from './lib/moving';", resolveDir: root, loader: 'ts' }, outfile: temp + '/moving-isolation.mjs', bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', tsconfig: root + '/tsconfig.json', plugins: [{ name: 'moving-hook-harness', setup(b) {
  b.onResolve({ filter: /^(react(?:\/jsx-runtime)?|lucide-react|\.\/shared|\.\/moving-intake)$/ }, a => ({ path: a.path, namespace: 'moving-mock' }));
  b.onLoad({ filter: /.*/, namespace: 'moving-mock' }, a => ({ loader: 'js', contents: a.path === 'react' ? 'export const {useState,useRef,useEffect,useCallback}=globalThis.__movingHooks' : a.path === 'react/jsx-runtime' ? 'export const jsx=(type,props,key)=>({type,props,key}),jsxs=jsx,Fragment="Fragment"' : a.path === 'lucide-react' ? 'export const ArrowRight="ArrowRight",Box="Box",Check="Check",ClipboardCheck="ClipboardCheck",Download="Download",MapPin="MapPin",RefreshCw="RefreshCw",Truck="Truck"' : a.path === './moving-intake' ? 'export const MovingBrief="MovingBrief"' : 'export const Empty="Empty",ErrorNotice="ErrorNotice",Notice="Notice"' }));
} }] });
const api = await import(temp + '/moving-isolation.mjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const uuid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
function data(name, n = 1) {
  const moving = api.defaultMoving();
  moving.origin.address = `${name} private collection address`;
  moving.destination.address = `${name} private destination address`;
  moving.inventory = [{ id: uuid(n + 100), item: `${name} private inventory`, room: 'Office', quantity: 1, fragile: false, heavy: false, disassembly: false, packed: false, notes: `${name} handling note` }];
  const job = { id: uuid(n), request_id: uuid(n + 10), service: 'moving', status: 'scheduled', version: 0, scheduled_date: '2099-10-24', address: moving.origin.address, customer_name: name, details: { moving } };
  return { user: { id: name }, jobs: [job], requests: [] };
}
function record(account, notes) { return { job_id: account.jobs[0].id, version: 1, stage: 'planning', checklist: [], checkedItems: [], transportPlan: '', notes, updated_at: '2099-10-01' }; }
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const editor = tree => nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'MoveEditor');
const search = tree => nodes(tree).find(node => node.type === 'input' && node.props.type === 'search');
const select = tree => nodes(tree).find(node => node.type === 'select');
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && JSON.stringify(node.props.children).includes(label));
const serialized = tree => JSON.stringify(tree);
function start(account, mode = 'admin', refresh = async () => {}) { const h = new Harness(api.MovingWorkspace, { data: account, mode, refresh }); h.render(); h.flushEffects(); return h; }
async function respond(request, body, status = 200) { request.resolve(Response.json(body, { status })); await tick(); }
async function loaded(account, mode = 'admin', refresh = async () => {}) { const h = start(account, mode, refresh); await respond(requests.at(-1), { runs: [record(account, account.user.id + ' saved notes')] }); h.render(); return h; }
afterEach(async () => {
  for (const h of [...harnesses]) h.unmount();
  for (const request of requests) if (!request.done) request.reject(new Error('Test cleaned up an abandoned request.'));
  await tick(); requests.length = 0; listeners.clear();
});
after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('sign-out hides even stale parent job props and a late GET cannot revive private moving data', async () => {
  const a = data('AccountA'), h = start(a), pending = requests[0];
  signout();
  assert.doesNotMatch(serialized(h.render()), /AccountA|private collection|private inventory/);
  assert.equal(pending.options.signal.aborted, true);
  await respond(pending, { runs: [record(a, 'AccountA secret late notes')] });
  assert.doesNotMatch(serialized(h.render()), /AccountA|secret late notes/);
  assert.equal(editor(h.tree), undefined);
});

test('account-change render never exposes prior search, inventory or notes, before or after effects', async () => {
  const a = data('AccountA'), b = data('AccountB', 2), h = await loaded(a);
  search(h.tree).props.onChange({ target: { value: 'AccountA private collection' } });
  select(h.tree).props.onChange({ target: { value: 'all' } });
  h.render(); assert.match(serialized(h.tree), /AccountA saved notes/);
  const beforeEffects = h.render({ ...h.props, data: b });
  assert.doesNotMatch(serialized(beforeEffects), /AccountA|private collection/);
  h.flushEffects(); h.render();
  assert.equal(search(h.tree).props.value, ''); assert.equal(select(h.tree).props.value, 'active');
  assert.doesNotMatch(serialized(h.tree), /AccountA/);
  await respond(requests.at(-1), { runs: [record(b, 'AccountB current notes')] });
  h.render(); assert.equal(editor(h.tree).props.saved.notes, 'AccountB current notes');
  assert.doesNotMatch(serialized(h.tree), /AccountA/);
});

test('an older account GET resolving after the new account GET cannot replace its saved record', async () => {
  const a = data('AccountA'), b = data('AccountB', 2), h = start(a), oldRead = requests[0];
  h.render({ ...h.props, data: b }); h.flushEffects();
  const newRead = requests.at(-1);
  assert.equal(oldRead.options.signal.aborted, true);
  await respond(newRead, { runs: [record(b, 'AccountB current record')] });
  await respond(oldRead, { runs: [record(a, 'AccountA late private record')] });
  h.render(); assert.equal(editor(h.tree).props.saved.notes, 'AccountB current record');
  assert.doesNotMatch(serialized(h.tree), /AccountA/);
});

test('a pending prior-account POST cannot refresh the new account or leave its controls stuck busy', async () => {
  const a = data('AccountA'), b = data('AccountB', 2); let oldRefreshes = 0, newRefreshes = 0;
  const h = await loaded(a, 'crew', async () => { oldRefreshes++; });
  const oldEditor = editor(h.tree);
  const saving = oldEditor.props.onSave({ ...oldEditor.props.saved, notes: 'AccountA private unsaved note' });
  const oldWrite = requests.at(-1); h.render(); assert.equal(editor(h.tree).props.busy, true);
  assert.equal(oldWrite.options.method, 'POST');
  assert.equal(JSON.parse(oldWrite.options.body).notes, 'AccountA private unsaved note');
  h.render({ data: b, mode: 'crew', refresh: async () => { newRefreshes++; } }); h.flushEffects();
  await respond(requests.at(-1), { runs: [record(b, 'AccountB current notes')] });
  h.render(); assert.equal(editor(h.tree).props.busy, false); assert.equal(search(h.tree).props.disabled, false);
  const count = requests.length;
  await respond(oldWrite, { ok: true, run: record(a, 'AccountA old saved response') });
  assert.equal(await saving, false); assert.equal(oldRefreshes, 0); assert.equal(newRefreshes, 0); assert.equal(requests.length, count);
  h.render(); assert.equal(editor(h.tree).props.saved.notes, 'AccountB current notes');
  assert.doesNotMatch(serialized(h.tree), /AccountA/);
});

test('late unauthorized POST responses cannot clear or add errors to the next account', async () => {
  const a = data('AccountA'), b = data('AccountB', 2), h = await loaded(a);
  const oldEditor = editor(h.tree), saving = oldEditor.props.onSave({ ...oldEditor.props.saved, notes: 'AccountA pending note' }), oldWrite = requests.at(-1);
  h.render({ ...h.props, data: b }); h.flushEffects();
  await respond(requests.at(-1), { runs: [record(b, 'AccountB valid record')] });
  await respond(oldWrite, { error: 'AccountA private authorization context' }, 403);
  assert.equal(await saving, false);
  h.render(); assert.equal(editor(h.tree).props.saved.notes, 'AccountB valid record');
  assert.doesNotMatch(serialized(h.tree), /AccountA|authorization context|no longer has access/);
});

test('an old refresh continuation cannot start a request or set loading for a new role scope', async () => {
  const a = data('AccountA'); let finishRefresh;
  const h = await loaded(a, 'admin', () => new Promise(resolve => { finishRefresh = resolve; }));
  const refreshing = button(h.tree, 'Refresh moves').props.onClick();
  h.render({ ...h.props, mode: 'crew', refresh: async () => {} });
  assert.doesNotMatch(serialized(h.tree), /AccountA private/);
  h.flushEffects();
  assert.equal(requests.at(-1).url, '/api/moves?mode=crew');
  await respond(requests.at(-1), { runs: [record(a, 'Current crew record')] });
  const count = requests.length; finishRefresh(); await refreshing;
  assert.equal(requests.length, count);
  h.render(); assert.equal(editor(h.tree).props.unavailable, false); assert.equal(editor(h.tree).props.saved.notes, 'Current crew record');
});

test('an unmounted workspace ignores its pending GET and POST without scheduling refreshes', async () => {
  const a = data('AccountA'), pendingHarness = start(a), pendingRead = requests.at(-1);
  pendingHarness.unmount(); await respond(pendingRead, { runs: [record(a, 'Unmounted private notes')] });
  assert.ok(!pendingHarness.states.some(value => Array.isArray(value) && value.some(row => row?.notes === 'Unmounted private notes')));
  let refreshes = 0;
  const h = await loaded(a, 'crew', async () => { refreshes++; }), oldEditor = editor(h.tree);
  const saving = oldEditor.props.onSave({ ...oldEditor.props.saved, notes: 'Unmounted private write' }), pendingWrite = requests.at(-1);
  h.unmount(); await respond(pendingWrite, { ok: true });
  assert.equal(await saving, false); assert.equal(refreshes, 0); assert.equal(pendingWrite.options.signal.aborted, true);
});

test('same-account refresh races preserve the newest result and authentication failures hide the entire private brief', async () => {
  const a = data('AccountA'), h = await loaded(a);
  const first = button(h.tree, 'Refresh moves').props.onClick(); await tick(); const oldRead = requests.at(-1);
  const second = button(h.tree, 'Refresh moves').props.onClick(); await tick(); const newRead = requests.at(-1);
  await respond(newRead, { runs: [record(a, 'Latest reviewed move notes')] }); await second;
  await respond(oldRead, { runs: [record(a, 'Stale overwritten notes')] }); await first;
  h.render(); assert.equal(editor(h.tree).props.saved.notes, 'Latest reviewed move notes');
  const expired = button(h.tree, 'Refresh moves').props.onClick(); await tick();
  await respond(requests.at(-1), { error: 'Your sign-in expired.' }, 401); await expired;
  h.render(); assert.doesNotMatch(serialized(h.tree), /Latest reviewed move notes|Stale overwritten notes|AccountA|private collection|private destination|private inventory/);
  assert.equal(editor(h.tree), undefined);
  const denied = nodes(h.tree).find(node => node.type === 'ErrorNotice');
  assert.ok(denied); assert.match(denied.props.message, /sign-in expired|no longer has access/i);
  assert.equal(typeof denied.props.retry, 'function');
});
