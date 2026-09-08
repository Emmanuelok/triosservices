import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'trios-customer-test-'));
process.on('exit',()=>fs.rmSync(work,{recursive:true,force:true}));
const source=fs.readFileSync(root+'/components/booking.tsx','utf8')+'\nexport {cleanForm,consumeQuery,initial};';
let state=[],refs=[],effectSlots=[],effects=[],stateIndex=0,refIndex=0,effectIndex=0,dirty=false;
globalThis.__hooks={useState(value){const index=stateIndex++;if(!(index in state))state[index]=value;return[state[index],next=>{state[index]=typeof next==='function'?next(state[index]):next;dirty=true}]},useRef(value){return refs[refIndex++]??={current:value}},useEffect(fn,deps){const index=effectIndex++,old=effectSlots[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))effects.push(()=>{old?.cleanup?.();effectSlots[index]={deps,cleanup:fn()}})}};
const storage=new Map(),listeners=new Map();
globalThis.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key),key:index=>[...storage.keys()][index],get length(){return storage.size}};
globalThis.window={location:{search:'?plan=lawn'},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),matchMedia:()=>({matches:true}),scrollTo(){}};
globalThis.__account={data:{user:{id:'customer-a',email:'a@example.com',name:'Customer A'},properties:[]},loading:false,error:''};
const stub={name:'customer-harness',setup(builder){builder.onResolve({filter:/^(react(?:\/jsx-runtime)?|lucide-react|sonner|\.\/shared|\.\/site-app|\.\/customer-tools|@\/components\/ui\/)/},args=>({path:args.path,namespace:'mock'}));builder.onLoad({filter:/.*/,namespace:'mock'},args=>{let contents;if(args.path==='react')contents='export const {useState,useEffect,useRef}=globalThis.__hooks';else if(args.path==='react/jsx-runtime')contents='export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment="Fragment"';else if(args.path==='lucide-react')contents='export const ArrowRight=0,ArrowLeft=0,Check=0,CheckCircle2=0,ShieldCheck=0,RotateCcw=0,FileDown=0,Copy=0,Pencil=0,CheckSquare=0,Leaf=0,Snowflake=0,Layers=0';else if(args.path==='sonner')contents='export const toast={success(){},error(){}}';else if(args.path==='./shared')contents='export const Pick=0,ServiceIcon=0,Notice=0,ErrorNotice=0,UploadPhotos=0,Loading=0;export const useData=()=>globalThis.__account,saveData=async()=>({ok:true,id:"saved"})';else if(args.path==='./site-app')contents='export const Intro=0';else if(args.path==='./customer-tools')contents='export const CustomerContact=0,useCustomerReadiness=()=>({readiness:{status:"setup_required",bookingAvailable:false,accountsAvailable:false},retry(){}}),customerToday=()=>"2026-09-08"';else contents='export const Checkbox=0,AlertDialog=0,AlertDialogContent=0,AlertDialogTitle=0,AlertDialogDescription=0,AlertDialogFooter=0,AlertDialogCancel=0';return{contents,loader:'js'}})}};
await build({stdin:{contents:source,resolveDir:root+'/components',sourcefile:'booking.tsx',loader:'tsx'},outfile:work+'/customer-isolation-bundle.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',plugins:[stub],tsconfig:root+'/tsconfig.json'});
const {Booking,cleanForm,consumeQuery,initial}=await import(work+'/customer-isolation-bundle.mjs');
assert.equal(cleanForm({...initial,details:{plan:'lawn'}}).details.plan,'lawn');
assert.deepEqual(consumeQuery(cleanForm(initial)).services,['lawn']);
assert.equal(consumeQuery(cleanForm(initial)).frequency,'Weekly');
window.location.search='?service=moving&tier=help&moveType=Loading%20%2F%20unloading%20only&transport=Request%20transport';
const moveQuery=consumeQuery(cleanForm(initial));
assert.deepEqual(moveQuery.services,['moving']);assert.equal(moveQuery.frequency,'One-time');assert.equal(moveQuery.details.moving.tier,'help');assert.equal(moveQuery.details.moving.transport,'Customer arranged');assert.equal(moveQuery.details.moving.moveType,'Loading / unloading only');
window.location.search='?services=moving,cleaning&tier=complete';const transitionQuery=consumeQuery(cleanForm(initial));assert.equal(transitionQuery.frequency,'One-time');assert.deepEqual(transitionQuery.services,['moving','cleaning']);
window.location.search='?service=moving&tier=pack&transport=Customer%20arranged';assert.equal(consumeQuery(cleanForm(initial)).details.moving.transport,'Customer arranged');
window.location.search='?service=moving&tier=unrecognized&moveType=invalid&transport=unsafe';
const safeQuery=consumeQuery(cleanForm(initial));assert.equal(safeQuery.details.moving.tier,'essentials');assert.equal(safeQuery.details.moving.moveType,'Home move');assert.equal(safeQuery.details.moving.transport,'Request transport');
window.location.search='?plan=care-planner';sessionStorage.setItem('trios-planner-handoff',JSON.stringify({version:1,services:['moving'],frequency:'Seasonal',details:{plan:'care-planner'}}));const plannerMove=consumeQuery(cleanForm({...initial,address:'123 Current Property'}));assert.equal(plannerMove.details.moving.tier,'essentials');assert.equal(plannerMove.details.moving.origin.address,'123 Current Property');assert.equal(plannerMove.frequency,'One-time');assert.equal(sessionStorage.getItem('trios-planner-handoff'),null);
sessionStorage.setItem('trios-planner-handoff',JSON.stringify({version:1,services:['moving','lawn'],frequency:'Weekly',details:{plan:'care-planner'}}));assert.equal(consumeQuery(cleanForm(initial)).frequency,'Mixed / help me choose');
const movingDraft={...moveQuery.details.moving,origin:{...moveQuery.details.moving.origin,address:'100 Private A Street'},destination:{...moveQuery.details.moving.destination,address:'200 Private destination'},inventory:[{id:'11111111-1111-4111-8111-111111111111',item:'Private inventory item',room:'Bedroom',quantity:2,fragile:true,heavy:false,disassembly:false,packed:false,notes:'Private handling note'}]};
const restoredMove=cleanForm({...initial,services:['moving'],details:{...initial.details,moving:movingDraft}});assert.equal(restoredMove.details.moving.destination.address,'200 Private destination');assert.equal(restoredMove.details.moving.inventory[0].quantity,2);
window.location.search='?plan=lawn';
const prefix='trios-quote-draft:v2:';
storage.set(prefix+'customer-a',JSON.stringify({version:2,scope:'customer-a',savedAt:Date.now(),form:{...initial,name:'Private A',address:'100 Private A Street',details:{...initial.details,moving:movingDraft,access:'A gate note',photos:['11111111-1111-4111-8111-111111111111']}}}));
function render(){stateIndex=0;refIndex=0;effectIndex=0;effects=[];dirty=false;const tree=Booking();for(const effect of effects)effect();return tree}
function settle(){for(let attempt=0;attempt<10;attempt++){render();if(!dirty)return}throw Error('Hook render did not settle')}
settle();assert.equal(state[0].address,'100 Private A Street');assert.equal(state[0].details.moving.destination.address,'200 Private destination');
// Exercise the actual MovingIntake date handler through Booking's persisted state and review transition.
function findNode(node,predicate){if(Array.isArray(node)){for(const child of node){const found=findNode(child,predicate);if(found)return found}return null}if(!node||typeof node!=='object')return null;if(predicate(node))return node;return findNode(node.props?.children,predicate)}
function nodeText(node){if(Array.isArray(node))return node.map(nodeText).join('');if(typeof node==='string'||typeof node==='number')return String(node);return node&&typeof node==='object'?nodeText(node.props?.children):''}
let bookingTree=render();findNode(bookingTree,node=>node.type==='button'&&nodeText(node).includes('Moving services')).props.onClick();settle();
bookingTree=render();findNode(bookingTree,node=>node.type==='form').props.onSubmit({preventDefault(){}});settle();assert.equal(state[1],1);
let intakeNode=findNode(render(),node=>typeof node.type==='function'&&node.type.name==='MovingIntake');let intakeTree=intakeNode.type(intakeNode.props);
findNode(intakeTree,node=>node.type==='input'&&node.props.type==='date').props.onChange({target:{value:'2099-06-01'}});settle();assert.equal(state[0].details.moving.moveDate,'2099-06-01');
intakeNode=findNode(render(),node=>typeof node.type==='function'&&node.type.name==='MovingIntake');intakeTree=intakeNode.type(intakeNode.props);assert.equal(findNode(intakeTree,node=>node.type==='input'&&node.props.type==='date').props.value,'2099-06-01');
findNode(intakeTree,node=>node.type==='input'&&node.props.placeholder==='e.g. 2-bedroom apartment or 8 desks').props.onChange({target:{value:'2-bedroom apartment'}});settle();assert.equal(state[0].details.moving.moveDate,'2099-06-01');
bookingTree=render();findNode(bookingTree,node=>node.type==='form').props.onSubmit({preventDefault(){}});settle();assert.equal(state[1],2,'Valid moving details advance to the review step');
assert.equal(findNode(render(),node=>typeof node.type==='function'&&node.type.name==='MovingBrief').props.value.moveDate,'2099-06-01');assert.equal(JSON.parse(storage.get(prefix+'customer-a')).form.details.moving.moveDate,'2099-06-01');
globalThis.__account={data:{user:{id:'customer-b',email:'b@example.com',name:'Customer B'},properties:[]},loading:false,error:''};
render();
assert.equal(storage.has(prefix+'customer-b'),false,'An account-change render must never save the previous form under the next account');
settle();const b=JSON.parse(storage.get(prefix+'customer-b'));assert.equal(b.form.address,'');assert.equal(b.form.details.access,'');assert.deepEqual(b.form.details.photos,[]);assert.equal(b.form.name,'Customer B');assert.equal(b.form.details.moving,undefined,'Private moving destination and inventory must not cross account boundaries');
listeners.get('trios:signout')();assert.equal(storage.has(prefix+'customer-a'),false);assert.equal(storage.has(prefix+'customer-b'),false);assert.equal(state[0].address,'');assert.equal(state[0].details.moving,undefined);
console.log('PASS lawn plan query and draft preservation; PASS account-switch render cannot save old form into the new account; PASS private access notes/photos stay scoped; PASS moving tier/type handoff; PASS controlled moving date survives edits, review and saved draft; PASS private moving addresses and inventory stay scoped; PASS sign-out clears all account drafts');
for(const slot of effectSlots)slot?.cleanup?.();fs.unlinkSync(work+'/customer-isolation-bundle.mjs');
