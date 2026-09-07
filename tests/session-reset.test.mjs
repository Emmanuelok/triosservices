import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trios-session-'));
const state=[],refs=[],effects=[];let cursor=0,refCursor=0,reloads=0;
globalThis.__hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next}]},useRef(initial){const i=refCursor++;return refs[i]??=( {current:initial} )},useCallback(fn){return fn},useEffect(fn){effects[0]=fn}};
const listeners=new Map();
globalThis.window={location:{reload(){reloads++}},addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(){},setInterval(){return 1},clearInterval(){}};
globalThis.document={visibilityState:'visible'};
const stub={name:'hook-stubs',setup(b){
 b.onResolve({filter:/^react$|^lucide-react$|^sonner$|^@\/components\/ui\/select$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?'export const {useState,useRef,useCallback,useEffect}=globalThis.__hooks':a.path==='lucide-react'?'export const Snowflake=0,Leaf=0,Sun=0,Wind=0,Flower2=0,Sprout=0,Scissors=0,Footprints=0,Droplets=0,Truck=0,Recycle=0,Armchair=0,Sparkles=0,House=0,Loader2=0,Upload=0,X=0,Info=0':a.path==='sonner'?'export const toast={}':'export const Select=0,SelectContent=0,SelectItem=0,SelectTrigger=0,SelectValue=0',loader:'js'}));
}};
await build({entryPoints:[root+'/components/shared.tsx'],outfile:temp+'/shared.mjs',bundle:true,format:'esm',platform:'node',jsx:'transform',plugins:[stub],tsconfig:root+'/tsconfig.json'});
const {useData}=await import(temp+'/shared.mjs');
function render(){cursor=0;refCursor=0;return useData('admin')}
function reply(body,status=200){globalThis.fetch=async()=>Response.json(body,{status})}
const privateData={user:{id:'owner'},jobs:[{address:'Private customer address'}]};
reply(privateData);await render().refresh();assert.equal(render().data.jobs.length,1);
globalThis.fetch=async()=>new Response('Session expired',{status:401});await render().refresh();assert.equal(render().data,null);assert.match(render().error,/expired/);
reply(privateData);await render().refresh();reply({error:'Denied'},403);await render().refresh();assert.equal(render().data,null);
console.log('PASS 401 and 403 clear previously loaded records, including non-JSON responses');
reply(privateData);await render().refresh();reply({user:null});await render().refresh();assert.equal(render().data.user,null);
reply({user:{id:'customer'},jobs:[]});await render().refresh();assert.equal(render().data,null);assert.equal(reloads,1);
console.log('PASS sign-out clears account data and account changes reload the guarded page');
reply(privateData);render();const cleanup=effects[0]();await new Promise(r=>setTimeout(r,0));assert.equal(render().data.jobs.length,1);
// Pending requests must not restore private records after a sign-out event.
let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve});const pending=render().refresh();listeners.get('trios:signout')();finish(Response.json(privateData));await pending;assert.equal(render().data,null);
reply(privateData);await render().refresh();globalThis.fetch=()=>new Promise(()=>{});listeners.get('pageshow')({persisted:true});assert.equal(render().data,null);cleanup();
console.log('PASS sign-out invalidates pending loads and history restores recheck access');
fs.rmSync(temp,{recursive:true,force:true});
