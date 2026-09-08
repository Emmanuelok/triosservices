'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Box, Check, ClipboardCheck, Download, MapPin, RefreshCw, Truck } from 'lucide-react';
import { cleanMoving, MOVING_TIERS, movingReadiness, movingSummary, type MovingDetails } from '@/lib/moving';
import { niceDate } from '@/lib/catalog';
import { MovingBrief } from './moving-intake';
import { Empty, ErrorNotice, Notice } from './shared';

const stages = [
  { id: 'planning', label: 'Planning', description: 'Review the agreed inventory, both addresses and the transport arrangement.' },
  { id: 'ready', label: 'Ready', description: 'The move-day plan has been reviewed and the next step is loading or the agreed labour task.' },
  { id: 'loading', label: 'Loading / work started', description: 'The assigned team has started the agreed move-day work.' },
  { id: 'delivery', label: 'Destination handover', description: 'Check the arrival access and account for the agreed items at the destination or labour handover.' },
  { id: 'walkthrough', label: 'Final walkthrough', description: 'Review item placement, the box count and any concerns before closing the visit.' },
  { id: 'completed', label: 'Completed', description: 'The team has saved the final move record and closed the service visit.' },
] as const;
const checks = [
  { id: 'access', label: 'Both access plans reviewed', detail: 'Check the addresses, stairs, elevator arrangements, parking and the latest approved access notes.' },
  { id: 'inventory', label: 'Agreed scope checked', detail: 'Review the inventory, estimated boxes, special items and the accepted quote before starting.' },
  { id: 'protection', label: 'Protection and handling reviewed', detail: 'Check the agreed handling method and property protection; record any existing concerns.' },
  { id: 'load', label: 'Loading or labour task checked', detail: 'Confirm the agreed loading, unloading or on-site task and the box count with the responsible person.' },
  { id: 'arrival', label: 'Arrival or handover checked', detail: 'Confirm the destination access or agreed labour handover, and account for the boxes.' },
  { id: 'walkthrough', label: 'Final walkthrough recorded', detail: 'Review placement and any issues with the customer or their representative, then record useful notes.' },
] as const;
type Stage = typeof stages[number]['id'];
export type MoveRun = { job_id:string; version:number; stage:Stage; checklist:string[]; checkedItems:string[]; transportPlan:string; notes:string; updated_at:string };
const details = (value:unknown):any => { if (value && typeof value === 'object') return value; try { return JSON.parse(String(value || '{}')); } catch { return {}; } };
const list = (value:unknown):string[] => { if (Array.isArray(value)) return value; try { const result=JSON.parse(String(value||'[]')); return Array.isArray(result)?result:[]; } catch { return []; } };
const moveFor = (job:any, data:any):MovingDetails|null => {
  const request=(data.requests||[]).find((record:any)=>record.id===job.request_id);
  const value=details(job.details||request?.details).moving;
  return value ? cleanMoving(value) : null;
};
const blankRun = (job:any, move:MovingDetails|null):MoveRun => ({job_id:job.id,version:0,stage:job.status==='completed'?'completed':'planning',checklist:[],checkedItems:[],transportPlan:'',notes:'',updated_at:''});

export function MovingWorkspace({data,mode,refresh,onNavigate}:{data:any;mode:'admin'|'crew'|'customer';refresh:()=>void|Promise<unknown>;onNavigate?:(tab:string)=>void}) {
  const scope=String(data?.user?.id||'')+':'+mode;
  const [runs,setRuns]=useState<MoveRun[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[loadedScope,setLoadedScope]=useState(''),[stateScope,setStateScope]=useState(scope),[accessDenied,setAccessDenied]=useState(false);
  const [filter,setFilter]=useState('active'),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[switchTo,setSwitchTo]=useState('');
  const active=useRef(false),revision=useRef(0),session=useRef(0),currentScope=useRef(scope);
  const readController=useRef<AbortController|null>(null),writeController=useRef<AbortController|null>(null);
  currentScope.current=scope;
  const load=useCallback(async()=>{
    if(!active.current||currentScope.current!==scope)return;
    const current=++revision.current,account=scope,controller=new AbortController();
    readController.current?.abort();readController.current=controller;
    const timeout=window.setTimeout(()=>controller.abort(),15000);setLoading(true);
    const isCurrent=()=>active.current&&current===revision.current&&currentScope.current===account;
    try{
      const response=await fetch('/api/moves?mode='+mode,{cache:'no-store',signal:controller.signal});
      if(!isCurrent())return;
      if(response.status===401||response.status===403){setRuns([]);setSelected('');setAccessDenied(true);}
      const result=await response.json();if(!isCurrent())return;
      if(!response.ok)throw new Error(result.error||'Moving records could not be loaded.');
      if(!Array.isArray(result.runs))throw new Error('Moving records could not be loaded. Please refresh.');
      setRuns(result.runs);setLoadedScope(account);setAccessDenied(false);setError('');
    }catch(exception){if(isCurrent())setError(controller.signal.aborted?'The connection timed out. Refresh to load the latest move record.':exception instanceof Error?exception.message:'Moving records could not be loaded.');}
    finally{window.clearTimeout(timeout);if(isCurrent())setLoading(false);}
  },[scope,mode]);
  useEffect(()=>{
    active.current=true;setRuns([]);setLoadedScope('');setSelected('');setDirty(false);setSwitchTo('');setSearch('');setFilter('active');setBusy(false);setError('');setStateScope(scope);setAccessDenied(false);load();
    const invalidate=()=>{active.current=false;++revision.current;++session.current;readController.current?.abort();writeController.current?.abort()};
    const clear=()=>{invalidate();setRuns([]);setLoadedScope('');setSelected('');setDirty(false);setSwitchTo('');setSearch('');setFilter('active');setError('');setBusy(false);setLoading(false);setStateScope('');setAccessDenied(false)};
    window.addEventListener('trios:signout',clear);
    return()=>{invalidate();window.removeEventListener('trios:signout',clear)};
  },[load]);
  async function save(job:any,value:MoveRun) {
    if(busy||!active.current||currentScope.current!==scope)throw new Error('Wait for the current update to finish.');
    const account=scope,currentSession=session.current,controller=new AbortController();writeController.current=controller;
    const isCurrent=()=>active.current&&currentSession===session.current&&account===currentScope.current;
    const timeout=window.setTimeout(()=>controller.abort(),20000);setBusy(true);
    try{
      const response=await fetch('/api/moves',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({jobId:job.id,jobVersion:job.version,version:value.version,stage:value.stage,checklist:value.checklist,checkedItems:value.checkedItems,transportPlan:value.transportPlan,notes:value.notes})});
      if(!isCurrent())return false;
      const result=await response.json();if(!isCurrent())return false;
      if(response.status===401||response.status===403){setRuns([]);setSelected('');setAccessDenied(true);setError('Your account no longer has access to this move. Refresh or sign in again.');}
      if(!response.ok)throw new Error(result.error||'The move record could not be saved.');
      setDirty(false);await refresh();if(isCurrent())await load();return isCurrent();
    }catch(exception){if(!isCurrent())return false;throw new Error(controller.signal.aborted?'The connection was interrupted. Refresh before trying again; the update may already have been saved.':exception instanceof Error?exception.message:'The move record could not be saved.');}
    finally{window.clearTimeout(timeout);if(isCurrent())setBusy(false);}
  }
  if(stateScope!==scope)return <section className="moving-workspace" aria-label="Moving workspace"><p role="status">Loading your private moving workspace…</p></section>;
  if(accessDenied)return <section className="moving-workspace" aria-label="Moving workspace"><ErrorNotice message={error||'Your account no longer has access to these moving records.'} retry={async()=>{await refresh();await load()}}/></section>;
  const scopedRuns=loadedScope===scope?runs:[];
  const jobs=(data.jobs||[]).filter((job:any)=>job.service==='moving');
  const movingRequests=(data.requests||[]).filter((request:any)=>list(request.services).includes('moving')&&request.status!=='cancelled'&&!jobs.some((job:any)=>job.request_id===request.id&&job.status!=='cancelled'));
  const visible=jobs.filter((job:any)=>{
    const move=moveFor(job,data);
    return (filter==='all'||filter==='active'&&['scheduled','in_progress'].includes(job.status)||job.status===filter)&&[job.address,job.customer_name,move?.destination.address,job.id,job.request_id].join(' ').toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a:any,b:any)=>String(a.scheduled_date).localeCompare(String(b.scheduled_date)));
  const selectedJob=visible.find((job:any)=>job.id===selected)||visible[0];
  const selectedMove=selectedJob?moveFor(selectedJob,data):null;
  const selectedRun=selectedJob?(scopedRuns.find(run=>run.job_id===selectedJob.id)||blankRun(selectedJob,selectedMove)):null;
  const openCount=jobs.filter((job:any)=>['scheduled','in_progress'].includes(job.status)).length;
  function selectJob(id:string){if(id===selectedJob?.id)return;if(dirty){setSwitchTo(id);return;}setSelected(id)}
  return <section className="moving-workspace" aria-label={mode==='customer'?'My moves':'Moving operations'}>
    <div className="move-workspace-banner"><div><span className="eyebrow">{mode==='customer'?'YOUR NEXT CHAPTER':'TRIOS / MOVE DAY'}</span><h2>{mode==='customer'?'Your move, in one place.':'From first box to final walkthrough.'}</h2><p>{mode==='customer'?'Follow the agreed plan, saved team updates and final handover from your private account.':'Bring the quote, inventory, access plan and crew record together for every move.'}</p></div><Truck size={54} aria-hidden="true"/></div>
    <div className="move-workspace-metrics"><div><strong>{openCount}</strong><span>Open move visits</span></div><div><strong>{movingRequests.length}</strong><span>Awaiting arrangements</span></div><div><strong>{jobs.filter((job:any)=>job.status==='completed').length}</strong><span>Completed visits</span></div></div>
    {movingRequests.length>0&&<section className="move-pending"><h3>{mode==='customer'?'Your move requests':'Move requests to progress'}</h3><p>Requests become move-day records after the customer accepts a written quote and Trios schedules the work.</p><div className="move-pending-grid">{movingRequests.map((request:any)=>{const value=details(request.details).moving,move=value?cleanMoving(value):null;return <article className="white-card" key={request.id}><span className="eyebrow">TR-{request.id.slice(0,8).toUpperCase()}</span><h4>{move?MOVING_TIERS.find(tier=>tier.id===move.tier)?.name:'Moving request'}</h4><p>{request.address}{move?.destination.address&&<><br/><ArrowRight size={18}/> {move.destination.address}</>}</p><span className="pill">{request.status==='quoted'?'Quote ready':request.status==='accepted'?'Awaiting scheduling':'Assessment requested'}</span>{move&&<p>Preferred {niceDate(move.moveDate)}{move.flexible?' · flexible':''}</p>}<button type="button" className="button small outline" onClick={()=>onNavigate?.(mode==='admin'?'Requests':'requests')}>Review request <ArrowRight size={18}/></button></article>})}</div></section>}
    <div className="move-workspace-controls"><label>Find a move<input type="search" value={search} disabled={busy||dirty} onChange={event=>setSearch(event.target.value)} placeholder="Address, customer or reference"/></label><label>Show<select value={filter} disabled={busy||dirty} onChange={event=>setFilter(event.target.value)}><option value="active">Upcoming & in progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="all">All move visits</option></select></label><button type="button" className="button outline" onClick={async()=>{setDirty(false);await refresh();await load()}} disabled={loading||busy||dirty}><RefreshCw size={18} className={loading?'spin':undefined}/>{loading?'Loading…':'Refresh moves'}</button></div>
    {mode==='admin'&&<a className="button outline move-export-link" href="/api/export?type=moves"><Download size={18}/>Export moving records</a>}{error&&<ErrorNotice message={error} retry={load}/>}
    {loading&&!scopedRuns.length&&<p role="status">Loading saved move-day records…</p>}
    {!loading&&!visible.length&&<Empty title={jobs.length?'No moves in this view.':mode==='crew'?'No moving visits assigned.':'Your move-day workspace is ready.'} action={mode==='customer'?<a className="button" href="/book?service=moving">Plan a move <ArrowRight size={18}/></a>:undefined}>{jobs.length?'Adjust the filter or search to find your move.':mode==='crew'?'Assigned moves appear here with the agreed inventory and both access plans.':'Once a moving quote is accepted and a visit is scheduled, the inventory, preparation and progress record appear here.'}</Empty>}
    {switchTo&&<div className="move-unsaved" role="status"><strong>There are unsaved updates for this move.</strong><p>Save the current record, or discard your edits to open another move.</p><div className="button-row"><button type="button" className="button outline" onClick={()=>setSwitchTo('')}>Keep editing</button><button type="button" className="button" onClick={()=>{setDirty(false);setSelected(switchTo);setSwitchTo('')}}>Discard and switch</button></div></div>}
    {selectedJob&&selectedRun&&<div className="move-workspace-grid"><nav className="move-workspace-list" aria-label="Choose a move visit">{visible.map((job:any)=>{const move=moveFor(job,data);const run=scopedRuns.find(value=>value.job_id===job.id);return <button type="button" className={job.id===selectedJob.id?'selected':''} key={job.id} disabled={busy} aria-current={job.id===selectedJob.id?'true':undefined} onClick={()=>selectJob(job.id)}><span>{niceDate(job.scheduled_date)}</span><strong>{job.address}</strong><span>{move?.destination.address||'Destination in move plan'}</span><span className="move-list-stage">{job.status==='cancelled'?'Cancelled':stages.find(stage=>stage.id===run?.stage)?.label||'Planning'} <ArrowRight size={17}/></span></button>})}</nav><MoveEditor key={scope+':'+selectedJob.id+':'+selectedJob.version+':'+selectedRun.version} job={selectedJob} move={selectedMove} saved={selectedRun} mode={mode} busy={busy} unavailable={loading||!!error} onSave={value=>save(selectedJob,value)} onReload={async()=>{setDirty(false);await refresh();await load()}} onDirty={setDirty} onNavigate={onNavigate}/></div>}
  </section>;
}

function MoveEditor({job,move,saved,mode,busy,unavailable,onSave,onReload,onDirty,onNavigate}:{job:any;move:MovingDetails|null;saved:MoveRun;mode:'admin'|'crew'|'customer';busy:boolean;unavailable:boolean;onSave:(value:MoveRun)=>Promise<boolean>;onReload:()=>Promise<void>;onDirty:(value:boolean)=>void;onNavigate?:(tab:string)=>void}) {
  const [form,setForm]=useState(saved),[error,setError]=useState(''),[savedMessage,setSavedMessage]=useState('');
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  const stageIndex=stages.findIndex(stage=>stage.id===saved.stage),next=stages[stageIndex+1];
  const editable=mode!=='customer'&&!['completed','cancelled'].includes(job.status)&&saved.stage!=='completed'&&!!move;
  const disabled=busy||unavailable||!editable;
  const dirty=JSON.stringify(form)!==JSON.stringify(saved);
  const missingChecks=checks.filter(check=>!form.checklist.includes(check.id));
  const missingItems=move?.inventory.filter(item=>!form.checkedItems.includes(item.id))||[];
  const completionBlocked=!!(missingChecks.length||missingItems.length);
  const transportBlocked=saved.stage==='planning'&&move?.transport==='Request transport'&&form.transportPlan.trim().length<15;
  const requiredForNext=next?.id==='loading'?['access','inventory','protection']:next?.id==='delivery'?['access','inventory','protection','load']:next?.id==='walkthrough'?['access','inventory','protection','load','arrival']:[];
  const missingForNext=checks.filter(check=>requiredForNext.includes(check.id)&&!form.checklist.includes(check.id));
  function edit<K extends keyof MoveRun>(key:K,value:MoveRun[K]){const nextValue={...form,[key]:value};setForm(nextValue);setError('');setSavedMessage('');onDirty(JSON.stringify(nextValue)!==JSON.stringify(saved))}
  async function submit(stage:Stage){setError('');setSavedMessage('');try{const success=await onSave({...form,stage});if(success&&mounted.current)setSavedMessage('Move record saved.');}catch(exception){if(mounted.current)setError(exception instanceof Error?exception.message:'The move record could not be saved.')}}
  function download(){
    if(!move)return;
    const record=['TRIOS MOVE-DAY BRIEF',`Visit: ${job.id}`,`Request: ${job.request_id}`,`Scheduled: ${niceDate(job.scheduled_date)} · ${job.time_window||'Window to be agreed'}`,`Visit status: ${job.status}`,`Saved move stage: ${stages[stageIndex]?.label||saved.stage}`,movingSummary(move),`Confirmed transport plan: ${saved.transportPlan||'Not yet recorded'}`,`Latest approved access instructions: ${job.access_notes||'Refer to the submitted plan'}`,'SAVED CHECKLIST',...checks.map(check=>`${saved.checklist.includes(check.id)?'[x]':'[ ]'} ${check.label}`),`Inventory lines accounted for: ${saved.checkedItems.length} / ${move.inventory.length}`,`Saved move notes: ${saved.notes||'None'}`,`Last move update: ${saved.updated_at||'No move-day update yet'}`].join('\n\n');
    const url=URL.createObjectURL(new Blob([record],{type:'text/plain;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`trios-move-${job.id.slice(0,8)}.txt`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <article className="move-workspace-detail">
    <div className="move-record-heading"><div><span className="eyebrow">TR-{String(job.request_id).slice(0,8).toUpperCase()}</span><h3>{mode==='customer'?'Your move-day record':job.customer_name||'Move-day record'}</h3><p>{niceDate(job.scheduled_date)} · {job.time_window||'Time window to be agreed'}<br/>St. John’s time{job.crew_name?' · '+job.crew_name:''}</p></div>{move&&<button type="button" className="button outline" onClick={download}><Download size={18}/>Move brief</button>}</div>
    {job.status==='cancelled'?<Notice>This visit is cancelled. Its saved moving record is available for reference.</Notice>:<><ol className="move-stage-track" aria-label="Saved move progress">{stages.map((stage,index)=><li key={stage.id} data-complete={index<stageIndex} aria-current={index===stageIndex?'step':undefined}><span>{index<stageIndex?<Check size={17}/>:index+1}</span><strong>{stage.label}</strong></li>)}</ol><div className="move-stage-summary"><ClipboardCheck size={24}/><div><strong>{stages[stageIndex]?.label}</strong><p>{stages[stageIndex]?.description}</p><p className="move-saved-time">{saved.updated_at?'Saved '+niceDate(saved.updated_at):'No move-day update has been saved yet.'} Updates are entered by the team; this is not live vehicle tracking.</p></div></div></>}
    {!move?<Notice>The original request has no complete moving plan. Contact the business owner before starting work so the scope can be reviewed.</Notice>:<>
      <details className="move-record-brief"><summary><MapPin size={20}/>Agreed request, inventory & access plan</summary><MovingBrief value={move}/><p>The accepted quote defines the final scope. Request an amendment if an address, item or task has changed.</p>{job.access_notes&&<div className="move-latest-access"><strong>Latest approved visit access instructions</strong><p>{job.access_notes}</p></div>}</details>
      {mode!=='customer'&&movingReadiness(move).flags.length>0&&<details className="move-review-flags"><summary>Review handling & access considerations ({movingReadiness(move).flags.length})</summary><ul>{movingReadiness(move).flags.map(flag=><li key={flag}>{flag}</li>)}</ul></details>}
      <section className="move-transport"><h4><Truck size={23}/>Transport arrangement</h4><p>Requested: {move.transport}. Vehicle suitability, driver, route, loading access and timing must match the accepted quote.</p>{mode==='admin'&&editable&&stageIndex<2?<label>Owner-confirmed transport and handover plan<textarea rows={4} maxLength={1500} disabled={disabled} value={form.transportPlan} onChange={event=>edit('transportPlan',event.target.value)} placeholder="Record the agreed vehicle and driver arrangements, route, access and responsible contact. Do not enter licence numbers or private credentials."/><span>This plan is visible to the customer and assigned crew.</span></label>:<p className="move-saved-note">{saved.transportPlan||(move.transport==='Customer arranged'?'The customer arranges a suitable vehicle and driver under the accepted quote.':'The owner has not recorded the transport arrangement yet.')}</p>}{stageIndex>=2&&mode==='admin'&&<p>Transport arrangements are locked after loading starts. Record any exception in the shared notes and agree changes with the customer.</p>}</section>
      <section className="move-run-checks"><h4><ClipboardCheck size={23}/>Move-day checklist</h4><p>{editable?'Record the checks you have actually completed. Every checkpoint is required before closing the move.':'The team records completed checks here as your move progresses.'}</p><div>{checks.map(check=><label className="move-check-row" key={check.id}><input type="checkbox" disabled={disabled} checked={form.checklist.includes(check.id)} onChange={event=>edit('checklist',event.target.checked?[...form.checklist,check.id]:form.checklist.filter(id=>id!==check.id))}/><span><strong>{check.label}</strong><span>{check.detail}</span></span></label>)}</div></section>
      <section className="move-inventory-checks"><h4><Box size={23}/>Item handover</h4><p>{form.checkedItems.length} of {move.inventory.length} inventory lines accounted for{move.boxCount?` · ${move.boxCount} estimated boxes to reconcile in the handover checks`:''}.</p>{move.inventory.length?<div>{move.inventory.map(item=><label className="move-check-row" key={item.id}><input type="checkbox" disabled={disabled} checked={form.checkedItems.includes(item.id)} onChange={event=>edit('checkedItems',event.target.checked?[...form.checkedItems,item.id]:form.checkedItems.filter(id=>id!==item.id))}/><span><strong>{item.quantity} × {item.item}</strong><span>{item.room||'Room to be agreed'}{item.fragile?' · fragile':''}{item.heavy?' · heavy / assessed handling':''}{item.disassembly?' · disassembly requested':''}</span>{item.notes&&<span>{item.notes}</span>}</span></label>)}</div>:<Notice>This request uses an estimated box count. Confirm the actual box handover and any differences in the completion notes.</Notice>}<p>Account for each listed quantity against the accepted quote. Record agreed exclusions, shortages or handling concerns in the notes; this checklist does not waive a customer’s right to raise a concern.</p></section>
    </>}
    <section className="move-record-notes"><h4>Move notes & handover</h4>{editable?<label>Update for the customer and team<textarea rows={5} disabled={disabled} maxLength={2500} value={form.notes} onChange={event=>edit('notes',event.target.value)} placeholder="Record packing progress, box reconciliation, placement, observed conditions, concerns and the agreed next action."/><span>These notes are visible in the customer’s account. Keep private credentials out of the record.</span></label>:<p className="move-saved-note">{saved.notes||'No moving notes have been recorded yet.'}</p>}</section>
    {mode==='customer'&&<div className="button-row"><button type="button" className="button outline" onClick={()=>onNavigate?.('changes')}>Request a visit change</button><button type="button" className="button outline" onClick={()=>onNavigate?.('messages')}>Ask about my move <ArrowRight size={18}/></button><a className="button outline" href={'/api/quote/'+job.request_id}>View accepted quote</a></div>}
    {editable&&<div className="move-save-panel">{error&&<><ErrorNotice message={error}/><button type="button" className="button outline" disabled={busy} onClick={async()=>{setForm(saved);setError('');await onReload()}}><RefreshCw size={18}/>Discard edits & reload latest</button></>}<p role="status">{busy?'Saving move record…':dirty?'You have unsaved move updates.':savedMessage||'Showing the saved move record.'}</p>{transportBlocked&&<p>The owner must record the agreed transport plan before this move can be marked ready.</p>}{missingForNext.length>0&&<p>Before advancing: {missingForNext.map(check=>check.label.toLowerCase()).join('; ')}.</p>}{next?.id==='completed'&&completionBlocked&&<p>Before completion: finish {missingChecks.length} checklist check{missingChecks.length===1?'':'s'} and account for {missingItems.length} inventory line{missingItems.length===1?'':'s'}.</p>}<div className="button-row"><button type="button" className="button outline" disabled={disabled||!dirty} onClick={()=>submit(saved.stage)}><Check size={18}/>{busy?'Saving…':'Save progress'}</button>{next&&<button type="button" className="button" disabled={disabled||transportBlocked||missingForNext.length>0||next.id==='completed'&&completionBlocked} onClick={()=>submit(next.id)}>{next.id==='completed'?'Complete move & close visit':'Advance: '+next.label}<ArrowRight size={18}/></button>}{dirty&&<button type="button" className="text-link" disabled={busy} onClick={()=>{setForm(saved);onDirty(false);setError('')}}>Discard edits</button>}</div>{next?.id==='completed'&&<p>Completion saves the final record and closes this service visit. Review the checks and notes before confirming.</p>}</div>}
  </article>;
}
