'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, Check, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { ErrorNotice, Empty, Notice } from './shared';
import { SERVICES, niceDate } from '@/lib/catalog';
import { localToday } from '@/lib/validation';

const kinds = { reschedule: 'Change a visit date', cancellation: 'Cancel a visit', access: 'Update access instructions', quality: 'Report a service concern' };
const serviceName = (id:string) => SERVICES.find(s=>s.id===id)?.name || id;
export function ServiceChanges({ mode, jobs, onUpdated }: { mode:'customer'|'admin'; jobs:any[]; requests?:any[]; onUpdated?:()=>void }) {
  const [items,setItems] = useState<any[]>([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [filter,setFilter] = useState('open'), [dialog,setDialog] = useState<any>(null), [formError,setFormError] = useState(''), [busy,setBusy] = useState(false);
  const active = useRef(false), revision = useRef(0), session = useRef(0);
  const readController = useRef<AbortController|null>(null), writeController = useRef<AbortController|null>(null);
  const refresh = useCallback(async()=>{
    if (!active.current) return;
    const current = ++revision.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const timeout = window.setTimeout(()=>controller.abort(),15000);
    setLoading(true);
    try {
      const response = await fetch('/api/service-changes?mode='+mode,{cache:'no-store',signal:controller.signal});
      if (!active.current || current!==revision.current) return;
      if (response.status===401||response.status===403) { setItems([]);setDialog(null); }
      const result = await response.json();
      if (!active.current || current!==revision.current) return;
      if (!response.ok) throw new Error(result.error || 'Service changes could not be loaded.');
      if (!Array.isArray(result.items)) throw new Error('Service changes could not be loaded. Please try again.');
      setItems(result.items);setError('');
    } catch (e) { if(active.current&&current===revision.current)setError(controller.signal.aborted?'The connection timed out. Please try again.':e instanceof Error ? e.message : 'Unable to load service changes.'); }
    finally { window.clearTimeout(timeout);if(active.current&&current===revision.current)setLoading(false); }
  },[mode]);
  useEffect(()=>{
    active.current=true;
    refresh();
    const invalidate=()=>{active.current=false;++revision.current;++session.current;readController.current?.abort();writeController.current?.abort()};
    const clear=()=>{invalidate();setItems([]);setDialog(null);setFormError('');setError('');setBusy(false);setLoading(false)};
    window.addEventListener('trios:signout',clear);window.addEventListener('focus',refresh);
    return()=>{invalidate();window.removeEventListener('trios:signout',clear);window.removeEventListener('focus',refresh)};
  },[refresh]);
  function open(value:any) { setFormError('');setDialog(value); }
  async function submit(payload:any) {
    if (busy || !active.current) return;
    const currentSession=session.current, controller=new AbortController();
    writeController.current=controller;
    const timeout=window.setTimeout(()=>controller.abort(),20000);
    const isCurrent=()=>active.current&&currentSession===session.current;
    setBusy(true);setFormError('');
    try {
      const response=await fetch('/api/service-changes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      if(!isCurrent())return;
      if(response.status===401||response.status===403){setItems([]);setDialog(null);setError(response.status===401?'Your sign-in has expired. Please sign in again.':'Your account no longer has access to these service requests.');}
      const result=await response.json();
      if(!isCurrent())return;
      if (!response.ok) throw new Error(result.error || 'The change could not be saved.');
      setDialog(null);await refresh();if(isCurrent())onUpdated?.();
    } catch (e) { if(isCurrent())setFormError(controller.signal.aborted?'The connection was interrupted. Refresh your requests before trying again.':e instanceof Error ? e.message : 'The connection was interrupted. Refresh before trying again.'); }
    finally { window.clearTimeout(timeout);if(isCurrent())setBusy(false); }
  }
  const visible=items.filter(item=>filter==='all'||item.status===filter);
  const edit=(key:string,value:string)=>setDialog((current:any)=>({...current,[key]:value}));
  const customerJobs=jobs.filter(job=>dialog?.kind==='quality'||['scheduled','in_progress'].includes(job.status));
  return <section className="service-changes" aria-label="Service changes and concerns">
    <div className="section-head"><div><div className="eyebrow">SERVICE SUPPORT</div><h3>{mode==='admin'?'Review requests. Keep everyone informed.':'When your plans change.'}</h3><p className="small-text">{mode==='admin'?'Review customer preferences before changing a visit. Every decision is recorded in the customer’s history.':'Request a different date, update access details or raise a concern about a visit.'}</p></div><div className="button-row"><button className="button small outline" type="button" onClick={refresh} disabled={loading}><RefreshCw size={17}/>{loading?'Loading…':'Refresh'}</button>{mode==='customer'&&jobs.length>0&&<button className="button small" type="button" onClick={()=>open({action:'create',id:crypto.randomUUID(),jobId:'',kind:'reschedule',message:'',requestedDate:'',requestedWindow:''})}><Plus size={17}/>New request</button>}</div></div>
    <Notice>Requests do not change an agreed visit until Trios approves them. Cancellation approval applies to the selected visit; payment and refund arrangements are handled separately.</Notice>
    <div className="change-filters" role="group" aria-label="Filter service changes">{['open','approved','declined','withdrawn','all'].map(value=><button className={'change-filter'+(filter===value?' selected':'')} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)} key={value}>{value==='all'?'All requests':value[0].toUpperCase()+value.slice(1)} <span>{items.filter(item=>value==='all'||item.status===value).length}</span></button>)}</div>
    {error&&<ErrorNotice message={error} retry={refresh}/>}
    {!loading&&!error&&!visible.length&&<Empty title={filter==='open'?'No changes awaiting review.':'No requests in this view.'}>{mode==='customer'?'Your service dates stay as agreed. You can raise a request for any visit listed in your account.':'Customer changes and service concerns appear here with the relevant visit and property.'}</Empty>}
    <div aria-live="polite">{visible.map(item=><article className="white-card change-card" key={item.id}>
      <div className="list-card-head"><div><span className="eyebrow">{kinds[item.kind as keyof typeof kinds]}</span><h3>{serviceName(item.service)}</h3><p className="small-text">{item.address}{mode==='admin'?` · ${item.customer_name}`:''}</p></div><span className={'pill change-status status-'+item.status}>{item.status}</span></div>
      <div className="change-dates"><span><CalendarClock size={18}/>Current visit: {niceDate(item.scheduled_date)} · {item.time_window}</span>{item.kind==='reschedule'&&<span><ArrowRight size={18}/>Requested: {niceDate(item.requested_date)} · {item.requested_window}</span>}</div>
      <p className="change-message">{item.message}</p>{item.resolution&&<div className="change-resolution"><ShieldCheck size={21}/><div><strong>Trios response</strong><p>{item.resolution}</p></div></div>}
      <div className="change-bottom"><span className="small-text muted">Requested {niceDate(item.created_at)} · #{item.id.slice(0,8).toUpperCase()}</span>{item.status==='open'&&(mode==='admin'?<button className="button small" type="button" onClick={()=>open({action:'resolve',id:item.id,version:item.version,jobVersion:item.job_version,decision:'',resolution:'',item})}>Review request <ArrowRight size={17}/></button>:<button className="button small outline" type="button" onClick={()=>open({action:'withdraw',id:item.id,version:item.version,item})}>Withdraw request</button>)}</div>
    </article>)}</div>
    <Dialog open={Boolean(dialog)} onOpenChange={value=>{if(!value&&!busy)setDialog(null)}}><DialogContent className="change-dialog" style={{maxWidth:740}}>
      <DialogTitle>{dialog?.action==='create'?'Request a service change':dialog?.action==='withdraw'?'Withdraw this request?':'Review the customer’s request'}</DialogTitle>
      <DialogDescription>{dialog?.action==='resolve'?'Check the visit and the customer’s message before recording your decision.':'Your current service arrangements remain in place until a change is approved.'}</DialogDescription>
      {formError&&<ErrorNotice message={formError}/>}
      {dialog&&<form onSubmit={event=>{event.preventDefault();const {item,...payload}=dialog;submit(payload)}}>
        {dialog.action==='create'&&<div className="form-grid">
          <label className="wide">What do you need?<select value={dialog.kind} onChange={e=>{edit('kind',e.target.value);edit('jobId','')}}>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label className="wide">Service visit<select required value={dialog.jobId} onChange={e=>edit('jobId',e.target.value)}><option value="">Choose a visit</option>{customerJobs.map(job=><option value={job.id} key={job.id}>{niceDate(job.scheduled_date)} · {serviceName(job.service)} · {job.address}</option>)}</select></label>
          {dialog.kind==='reschedule'&&<><label>Preferred date<input required type="date" min={localToday()} value={dialog.requestedDate} onChange={e=>edit('requestedDate',e.target.value)}/></label><label>Preferred time window<input required minLength={2} maxLength={150} value={dialog.requestedWindow} onChange={e=>edit('requestedWindow',e.target.value)} placeholder="For example, 1–4 PM"/></label></>}
          <label className="wide">{dialog.kind==='access'?'New access instructions':'Tell us what has changed'}<textarea required rows={5} minLength={5} maxLength={2000} value={dialog.message} onChange={e=>edit('message',e.target.value)} placeholder={dialog.kind==='access'?'Gate location, parked vehicles, pets or the agreed work area. Do not include alarm codes or passwords.':'Add details that will help Trios review this request.'}/></label>
        </div>}
        {dialog.action==='resolve'&&<><div className="summary-mini"><strong>{kinds[dialog.item.kind as keyof typeof kinds]} · {dialog.item.address}</strong><p className="change-message">{dialog.item.message}</p>{dialog.item.requested_date&&<p>Preferred: {niceDate(dialog.item.requested_date)} · {dialog.item.requested_window}</p>}</div><div className="form-grid"><label className="wide">Decision<select required value={dialog.decision} onChange={e=>edit('decision',e.target.value)}><option value="">Choose a decision</option><option value="approved">{dialog.item.kind==='reschedule'?'Approve and move this visit':dialog.item.kind==='cancellation'?'Approve and cancel this visit':dialog.item.kind==='access'?'Approve and update crew access notes':'Approve the service follow-up'}</option><option value="declined">Decline and explain the next step</option></select></label><label className="wide">Response to the customer<textarea required rows={5} minLength={5} maxLength={2000} value={dialog.resolution} onChange={e=>edit('resolution',e.target.value)} placeholder="Explain the agreed outcome and any next action. This appears in the customer’s account."/></label></div><Notice>{dialog.item.kind==='quality'?'Approval records your response. If a return visit is required, schedule it separately from the accepted service request.':dialog.item.kind==='access'?'Approval replaces the visit’s latest crew access instructions with the customer’s message.':'Approving this request applies the chosen change to the visit and records the outcome atomically. Capacity and concurrent changes are checked before saving.'}</Notice></>}
        {dialog.action==='withdraw'&&<p className="change-message">This closes your pending request. It does not cancel or move the service visit.</p>}
        <div className="button-row" style={{justifyContent:'flex-end'}}><button type="button" className="button outline" disabled={busy} onClick={()=>setDialog(null)}>Close</button><button type="submit" className="button" disabled={busy}><Check size={18}/>{busy?'Saving…':dialog.action==='create'?'Send for review':dialog.action==='withdraw'?'Withdraw request':'Confirm decision'}</button></div>
      </form>}
    </DialogContent></Dialog>
  </section>;
}
