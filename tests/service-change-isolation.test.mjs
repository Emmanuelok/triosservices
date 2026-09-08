import {build} from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'trios-change-test-'));
const out=path.join(work,'service-change-isolation-bundle.mjs');
process.on('exit',()=>fs.rmSync(work,{recursive:true,force:true}));
let state=[],refs=[],effects=[],stateIndex=0,refIndex=0,effectIndex=0;
globalThis.__hooks={useState(initial){const i=stateIndex++;if(!(i in state))state[i]=initial;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next]},useRef(initial){return refs[refIndex++]??={current:initial}},useCallback(fn){return fn},useEffect(fn){effects[effectIndex++]=fn}};
const listeners=new Map();globalThis.window={setTimeout,clearTimeout,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
await build({entryPoints:[root+'/components/service-changes.tsx'],outfile:out,bundle:true,format:'esm',platform:'node',jsx:'automatic',tsconfig:root+'/tsconfig.json',plugins:[{name:'harness',setup(b){b.onResolve({filter:/^(react(?:\/jsx-runtime)?|lucide-react|\.\/shared|\.\/ui\/dialog)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='react'?'export const {useState,useRef,useEffect,useCallback}=globalThis.__hooks':a.path==='react/jsx-runtime'?'export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment="Fragment"':a.path==='lucide-react'?'export const ArrowRight=0,CalendarClock=0,Check=0,Plus=0,RefreshCw=0,ShieldCheck=0':a.path==='./shared'?'export const ErrorNotice=0,Empty=0,Notice=0':'export const Dialog=0,DialogContent=0,DialogTitle=0,DialogDescription=0'}))}}]});
const {ServiceChanges}=await import(out);
function render(){stateIndex=refIndex=effectIndex=0;return ServiceChanges({mode:'customer',jobs:[]})}
let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve});render();const cleanup=effects[0]();listeners.get('trios:signout')();finish(Response.json({items:[{id:'private-a',address:'Private A address',status:'open'}]}));await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(state[0],[]);assert.equal(state[1],false);cleanup();
state=[];refs=[];effects=[];render();const cleanup2=effects[0]();cleanup2();finish(Response.json({items:[{id:'private-a',address:'Private A address',status:'open'}]}));await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(state[0],[]);
console.log('PASS late service-change response cannot revive private account records after logout; PASS unmounted service-change panel ignores its pending response');fs.unlinkSync(out);
