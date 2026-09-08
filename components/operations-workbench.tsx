'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, ClipboardList, Download, MapPin, Phone, Search, SlidersHorizontal, Users, Wrench } from 'lucide-react';
import { localToday } from '@/lib/validation';
import { money, niceDate } from '@/lib/catalog';
import { Empty, Pick } from './shared';
import { DispatchTools } from './operations-tools';
import { Status, serviceName } from './portal';

const OPEN = ['scheduled', 'in_progress'];
export function recordDetails(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try { const parsed = JSON.parse(typeof value === 'string' ? value : '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
export function recordList(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(typeof value === 'string' ? value : '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function shiftedDate(date: string, days: number) {
  const value = new Date((date || localToday()) + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
function compareVisits(a: any, b: any) {
  return String(a.scheduled_date).localeCompare(String(b.scheduled_date)) || Number(b.status === 'in_progress') - Number(a.status === 'in_progress') || Number(b.priority === 'Priority') - Number(a.priority === 'Priority') || String(a.area || '').localeCompare(String(b.area || '')) || String(a.address || '').localeCompare(String(b.address || ''));
}
type WorkbenchProps = {
  data: any; crewMode: boolean; date: string; onDate: (date: string) => void; search: string;
  preset?: string;
  onOpenJob: (job: any, nextStatus?: string) => void; onAssign: (job: any) => void; onReschedule: (job: any) => void; onSaved: () => void;
};

export function VisitInstructions({job}: {job: any}) {
  const details = recordDetails(job.details);
  const instructions = [
    ['Latest agreed access update', job.access_notes],
    ['Access', details.access || 'No special access instructions recorded.'],
    ['Departure time', details.departureTime],
    ['Snow placement', details.snowStorage],
    ['Surface / slope', [details.surface, details.slope].filter(Boolean).join(' · ')],
    ['Requested extras', [details.salt && 'Salting', details.walkway && 'Walkway', details.priority && 'Priority service'].filter(Boolean).join(' · ')],
  ].filter(([, value]) => value);
  return <div className="ops-instructions"><dl>{instructions.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!!recordList(details.photos).length && <div className="photo-thumbs">{recordList(details.photos).map((id: string) => <a key={id} href={'/api/files/' + id} target="_blank" rel="noreferrer"><img src={'/api/files/' + id} alt="Customer property reference"/></a>)}</div>}
  </div>;
}

export function SchedulingPreview({form,data}:{form:any;data:any}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(form.date)||!Number.isInteger(form.visits)||form.visits<1||form.visits>26||!Number.isInteger(form.interval)||form.interval<1||form.interval>60)return null;
  const firstDate=new Date(form.date+'T12:00:00Z');
  if(Number.isNaN(firstDate.getTime())||firstDate.toISOString().slice(0,10)!==form.date)return null;
  const capacity=data.settings?.dailyCapacity||12;
  const dates=Array.from({length:form.visits},(_,index)=>shiftedDate(form.date,index*form.interval));
  const rows=dates.map(date=>{
    const open=(data.jobs||[]).filter((j:any)=>j.scheduled_date===date&&OPEN.includes(j.status));
    const duplicate=(data.jobs||[]).some((j:any)=>j.request_id===form.requestId&&j.service===form.service&&j.scheduled_date===date&&j.status!=='cancelled');
    const assigned=form.crewId?open.filter((j:any)=>j.crew_id===form.crewId).length:0;
    return {date,duplicate,assigned,overCapacity:!!form.crewId&&assigned+1>capacity};
  });
  return <div className="ops-schedule-preview"><div><strong>{dates.length} visit{dates.length===1?'':'s'} will be created</strong><p>Review each planned date before saving. Capacity and duplicate visits are checked again by the server.</p></div><ol>{rows.map(row=><li key={row.date} className={row.duplicate||row.overCapacity?'has-conflict':''}><span>{niceDate(row.date)}</span><span>{row.duplicate?'Existing visit on this date':row.overCapacity?`Would exceed crew capacity (${row.assigned+1}/${capacity})`:form.crewId?`${row.assigned+1} / ${capacity} open crew visits after scheduling`:'Crew assignment pending'}</span></li>)}</ol></div>;
}

export function DispatchWorkbench({data, crewMode, date, onDate, search, preset, onOpenJob, onAssign, onReschedule, onSaved}: WorkbenchProps) {
  const [crew, setCrew] = useState(preset==='unassigned'?'unassigned':'all'), [status, setStatus] = useState(preset==='overdue'?'overdue':'open'), [area, setArea] = useState('all'), [service, setService] = useState('all'), [assignmentOpen, setAssignmentOpen] = useState(false);
  const allJobs = useMemo(() => (data.jobs || []).map((job: any) => {
    const request = (data.requests || []).find((r: any) => r.id === job.request_id);
    const person = (data.crew || []).find((c: any) => c.id === job.crew_id);
    return {...job, details: job.details || request?.details, crew_name: job.crew_name || person?.name};
  }).sort(compareVisits), [data.jobs, data.requests, data.crew]);
  const day = date || localToday();
  const dayJobs = allJobs.filter((j: any) => j.scheduled_date === day && j.status !== 'cancelled');
  const open = dayJobs.filter((j: any) => OPEN.includes(j.status));
  const completed = dayJobs.filter((j: any) => j.status === 'completed');
  const next = allJobs.find((j: any) => j.status === 'in_progress') || allJobs.find((j: any) => j.scheduled_date === localToday() && j.status === 'scheduled');
  const matched = allJobs.filter((j: any) => (!date || j.scheduled_date === date)
    && (crew === 'all' || (crew === 'unassigned' ? !j.crew_id : j.crew_id === crew))
    && (status === 'all' || (status === 'open' ? OPEN.includes(j.status) : status === 'priority' ? j.priority === 'Priority' && OPEN.includes(j.status) : status === 'overdue' ? j.scheduled_date < localToday() && OPEN.includes(j.status) : j.status === status))
    && (area === 'all' || j.area === area) && (service === 'all' || j.service === service)
    && `${j.address} ${j.area} ${j.customer_name} ${j.crew_name || ''} ${serviceName(j.service)}`.toLowerCase().includes(search.trim().toLowerCase()));
  const groups = new Map<string, any[]>();
  for (const job of matched) { const key = job.scheduled_date + '|' + job.area; groups.set(key, [...(groups.get(key) || []), job]); }
  const communities = [...new Set(allJobs.map((j: any) => j.area).filter(Boolean))] as string[];
  const services = [...new Set(allJobs.map((j: any) => j.service).filter(Boolean))] as string[];
  const activeCrews = (data.crew || []).filter((c: any) => c.active);
  const unassigned = open.filter((j: any) => !j.crew_id).length;
  function reset() { onDate(localToday()); setCrew('all'); setStatus('open'); setArea('all'); setService('all'); }

  return <section className="ops-workbench" aria-label={crewMode ? 'Your visit workbench' : 'Dispatch workbench'}>
    {crewMode && <div className="ops-crew-brief"><div><span className="eyebrow">YOUR NEXT VISIT</span><h2>{next ? next.address : 'Your work, ready when you are.'}</h2><p>{next ? `${serviceName(next.service)} · ${niceDate(next.scheduled_date)} · ${next.area} · ${next.time_window}` : 'Your assigned visits appear below. Check the date filters for upcoming work.'}</p>{next && <p className="small-text">{next.status === 'in_progress' ? 'Continue the visit already in progress.' : 'Today’s priority visits are shown first. Confirm the agreed arrival window before travel.'}</p>}</div>{next && <div className="button-row"><button className="button lime" onClick={() => onOpenJob(next, next.status === 'scheduled' ? 'in_progress' : undefined)}>{next.status === 'in_progress' ? 'Continue visit' : 'Review and start'}<ArrowRight size={20}/></button>{next.phone&&<a className="button outline" href={'tel:' + next.phone}><Phone size={18}/>Call customer</a>}</div>}</div>}
    <div className="ops-workbench-heading"><div><span className="eyebrow">{crewMode ? 'ASSIGNED WORK' : 'VISIT WORKBENCH'}</span><h2>{date ? niceDate(date) : 'All scheduled dates'}</h2><p>St. John’s time · {crewMode ? 'Your saved visits and property instructions.' : 'Manage assignments, arrival windows and completion in one place.'}</p></div><a className="button outline" href={'/api/calendar?mode=' + (crewMode ? 'crew' : 'admin')}><Download size={19}/>Calendar</a></div>
    <div className="ops-day-metrics" aria-label={'Visit totals for ' + niceDate(day)}>{[
      {label: 'Planned visits', value: dayJobs.length, Icon: CalendarDays}, {label: 'Still to finish', value: open.length, Icon: Clock}, {label: 'Completed', value: completed.length, Icon: CheckCircle2}, {label: crewMode ? 'Priority visits open' : 'Awaiting assignment', value: crewMode ? open.filter((j: any) => j.priority === 'Priority').length : unassigned, Icon: crewMode ? ClipboardList : Users},
    ].map(m => <div key={m.label}><m.Icon size={23}/><strong>{m.value}</strong><span>{m.label}</span></div>)}</div>
    {!date && <p className="small-text muted ops-metric-note">The totals above are for today. The list below includes all dates.</p>}
    {!!dayJobs.length && <div className="ops-day-progress"><span>{completed.length} of {dayJobs.length} visits completed for {niceDate(day)}</span><progress max={dayJobs.length} value={completed.length} aria-label="Visits completed for selected day"/></div>}
    <div className="ops-filter-panel"><div className="ops-date-controls"><button className="button outline" aria-label="Previous day" onClick={() => onDate(shiftedDate(date, -1))}><ChevronLeft size={21}/></button><label>Visit date<input aria-label="Visit date" type="date" value={date} onChange={e => onDate(e.target.value)}/></label><button className="button outline" aria-label="Next day" onClick={() => onDate(shiftedDate(date, 1))}><ChevronRight size={21}/></button><button className="button outline" onClick={() => onDate(localToday())}>Today</button><button className="button outline" onClick={() => onDate('')}>All dates</button></div>
      <div className="ops-filter-grid"><div className="field"><label>Visit status</label><Pick label="Filter visit status" value={status} onChange={v => {setStatus(v); if (v === 'overdue') onDate('');}} options={[{value:'open',label:'Open visits'},{value:'all',label:'All statuses'},{value:'scheduled',label:'Scheduled'},{value:'in_progress',label:'In progress'},{value:'completed',label:'Completed'},{value:'cancelled',label:'Cancelled'},{value:'priority',label:'Priority open visits'},{value:'overdue',label:'Past-date open visits'}]}/></div>
        {!crewMode && <div className="field"><label>Crew assignment</label><Pick label="Filter by crew" value={crew} onChange={setCrew} options={[{value:'all',label:'All crew assignments'},{value:'unassigned',label:'Awaiting assignment'},...(data.crew || []).map((c:any)=>({value:c.id,label:c.name + (c.active ? '' : ' · inactive')}))]}/></div>}
        <div className="field"><label>Community</label><Pick label="Filter visit community" value={area} onChange={setArea} options={[{value:'all',label:'All communities'},...communities]}/></div><div className="field"><label>Service</label><Pick label="Filter visit service" value={service} onChange={setService} options={[{value:'all',label:'All services'},...services.map(id=>({value:id,label:serviceName(id)}))]}/></div></div>
      <div className="ops-filter-footer"><span role="status"><Search size={18}/>{matched.length} matching visit{matched.length === 1 ? '' : 's'}</span><button className="text-link" onClick={reset}>Reset visit filters</button>{!crewMode && <button className="button outline" aria-expanded={assignmentOpen} aria-controls="ops-bulk-dispatch" onClick={() => setAssignmentOpen(!assignmentOpen)}><SlidersHorizontal size={18}/>{assignmentOpen ? 'Close bulk assignment' : 'Assign visits together'}</button>}</div>
    </div>
    {!crewMode && assignmentOpen && <div id="ops-bulk-dispatch"><DispatchTools data={data} jobs={matched} onSaved={onSaved}/></div>}
    {!crewMode && !!activeCrews.length && <div className="ops-workload-strip" aria-label="Open workload by crew">{activeCrews.map((c:any)=>{const count=open.filter((j:any)=>j.crew_id===c.id).length, capacity=data.settings?.dailyCapacity||12;return <button className={'ops-workload-item'+(crew===c.id?' selected':'')} key={c.id} onClick={()=>setCrew(crew===c.id?'all':c.id)} aria-pressed={crew===c.id}><span>{c.name}</span><strong>{count} / {capacity}</strong><progress max={Math.max(count,capacity)} value={count} aria-label={c.name+' open visits for '+niceDate(day)}/><small>Open visits · {niceDate(day)}</small></button>})}</div>}
    {!matched.length ? <Empty title={allJobs.length ? 'No visits match these filters.' : 'Your first visit starts here.'} action={<button className="button outline" onClick={reset}>Show today’s open visits</button>}>{allJobs.length ? 'Try another date, crew, service or search term. Completed work stays available under All statuses.' : crewMode ? 'Once Trios assigns a visit to your crew account, its customer details and service instructions appear here.' : 'Open an accepted request and schedule its first visit. Assign it to an active crew member when ready.'}</Empty> : [...groups.entries()].map(([key, jobs])=><section className="ops-visit-group" key={key}><div className="ops-group-title"><h3>{jobs[0].area}</h3><span>{niceDate(jobs[0].scheduled_date)} · {jobs.length} visit{jobs.length===1?'':'s'}</span></div><div className="ops-visit-grid">{jobs.map((job:any)=><article key={job.id} className={'ops-visit-card '+(job.status==='in_progress'?'is-progress':'')}><div className="ops-visit-top"><span className="eyebrow">{serviceName(job.service)}</span><Status value={job.status}/></div><h3>{job.address}</h3><p>{job.customer_name} · {job.area}</p><div className="ops-visit-facts"><span><Clock size={18}/>{job.time_window}</span>{!crewMode&&<span><Users size={18}/>{job.crew_name||'Awaiting assignment'}</span>}{job.priority==='Priority'&&<span className="ops-priority">Priority agreement</span>}{OPEN.includes(job.status)&&job.scheduled_date<localToday()&&<span className="ops-past-date">Past scheduled date · review required</span>}</div><details className="ops-access"><summary>Property instructions & access</summary><VisitInstructions job={job}/></details>{job.notes&&<p className="ops-saved-note"><strong>Saved service notes</strong>{job.notes}</p>}<div className="ops-visit-actions"><button className="button" onClick={()=>onOpenJob(job)}>{job.status==='completed'?'Completion record':job.status==='cancelled'?'Visit record':'Open visit'}<ArrowRight size={18}/></button><a className="button outline" href={'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(job.address+', '+job.area+', Newfoundland and Labrador')} target="_blank" rel="noreferrer"><MapPin size={18}/>Directions</a>{job.phone&&<a className="button outline" href={'tel:'+job.phone}><Phone size={18}/>Call</a>}</div>{OPEN.includes(job.status)&&<div className="ops-visit-secondary">{crewMode?<button className="text-link" onClick={()=>onOpenJob(job,job.status==='scheduled'?'in_progress':'completed')}>{job.status==='scheduled'?'Review and start visit':'Review completion'}<CheckCircle2 size={18}/></button>:<><button className="text-link" onClick={()=>onAssign(job)}>Assign crew</button><button className="text-link" onClick={()=>onReschedule(job)}>Reschedule</button></>}</div>}</article>)}</div></section>)}
  </section>;
}

export function OperationsOverview({data,onTab,onOpenJob,onCreate}: {data:any;onTab:(tab:string,status?:string)=>void;onOpenJob:(job:any)=>void;onCreate:()=>void}) {
  const day=localToday(),jobs=data.jobs||[],requests=data.requests||[],invoices=data.invoices||[],equipment=data.equipment||[],events=data.events||[];
  const open=jobs.filter((j:any)=>OPEN.includes(j.status)),todays=jobs.filter((j:any)=>j.scheduled_date===day&&j.status!=='cancelled'),done=todays.filter((j:any)=>j.status==='completed');
  const balance=invoices.reduce((sum:number,i:any)=>sum+Math.max(0,i.amount_cents+i.tax_cents-(i.paid_cents||0)),0);
  const paid=(data.payments||[]).reduce((sum:number,p:any)=>sum+p.amount_cents,0),cost=jobs.reduce((sum:number,j:any)=>sum+(j.cost_cents||0),0);
  const unquoted=requests.filter((r:any)=>r.status==='requested').length,unscheduled=requests.filter((r:any)=>r.status==='accepted'&&!jobs.some((j:any)=>j.request_id===r.id&&j.status!=='cancelled')).length;
  const equipmentDue=equipment.filter((e:any)=>e.status!=='Ready'||(e.next_service&&e.next_service<=day));
  const priorities=[{n:open.filter((j:any)=>j.scheduled_date<day).length,title:'Past-date visits to review',detail:'Reschedule or record the work completed.',tab:'Schedule',status:'overdue',Icon:Clock},{n:open.filter((j:any)=>!j.crew_id&&j.scheduled_date<=day).length,title:'Visits needing a crew',detail:'Assign today’s open work before departure.',tab:'Schedule',status:'unassigned',Icon:Users},{n:unquoted,title:'Customer requests to quote',detail:'Review property details and prepare the scope.',tab:'Requests',status:'requested',Icon:ClipboardList},{n:unscheduled,title:'Approved requests to schedule',detail:'Create the first visit against the accepted quote.',tab:'Requests',status:'unscheduled',Icon:CalendarDays},{n:invoices.filter((i:any)=>i.status!=='paid'&&i.due_date<day).length,title:'Overdue invoices',detail:'Review balances and verified payment records.',tab:'Billing',status:'overdue',Icon:Clock},{n:equipmentDue.length,title:'Equipment needing attention',detail:'Maintenance due or equipment unavailable.',tab:'Equipment',status:'attention',Icon:Wrench}];
  return <div className="ops-overview"><div className="ops-overview-hero"><div><span className="eyebrow">TODAY AT TRIOS</span><h2>Every property.<br/>Every promise.</h2><p>{todays.length ? `${done.length} of ${todays.length} scheduled visits completed today. Keep the next commitment moving.` : 'Build today’s schedule from approved requests, then keep the crew and customer in step.'}</p><div className="button-row"><button className="button lime" onClick={()=>onTab('Schedule')}>Open dispatch<ArrowRight size={20}/></button><button className="button outline" onClick={onCreate}>New enquiry</button></div></div><div className="ops-today-summary"><span>{niceDate(day)}</span><strong>{todays.length}</strong><span>visits on today’s schedule</span><div><span>{open.filter((j:any)=>j.scheduled_date===day).length} open</span><span>{done.length} completed</span></div><progress max={todays.length||1} value={done.length} aria-label="Today’s completed visits"/></div></div>
    <div className="ops-finance-metrics">{[{label:'Outstanding invoices',value:money(balance/100),note:'Remaining balance across loaded invoices'},{label:'Verified payments',value:money(paid/100),note:'Received payments recorded in the workspace'},{label:'Recorded visit costs',value:money(cost/100),note:'Recorded costs only; not business profit'},{label:'Active crew members',value:(data.crew||[]).filter((c:any)=>c.active).length,note:'Crew with current workspace access'}].map(m=><div className="white-card" key={m.label}><span>{m.label}</span><strong>{m.value}</strong><p>{m.note}</p></div>)}</div>
    <div className="ops-section-heading"><div><span className="eyebrow">PRIORITY REVIEW</span><h2>What needs your attention</h2></div><span>{priorities.reduce((sum,p)=>sum+p.n,0)} attention items · records may overlap</span></div><div className="ops-attention-grid">{priorities.map(p=><button className={'ops-attention '+(p.n?'has-items':'')} key={p.title} onClick={()=>onTab(p.tab,p.status)}><div><p.Icon size={24}/><strong>{p.n}</strong></div><h3>{p.title}</h3><p>{p.detail}</p><span>Review<ArrowRight size={18}/></span></button>)}</div>
    <div className="ops-overview-bottom"><section className="white-card"><div className="ops-section-heading"><h3>Next work to review</h3><button className="text-link" onClick={()=>onTab('Schedule')}>All visits<ArrowRight size={17}/></button></div>{open.filter((j:any)=>j.scheduled_date>=day).sort(compareVisits).slice(0,5).map((j:any)=><button key={j.id} className="ops-next-row" onClick={()=>onOpenJob(j)}><div><strong>{j.address}</strong><span>{serviceName(j.service)} · {niceDate(j.scheduled_date)} · {j.time_window}</span></div><ArrowRight size={20}/></button>)}{!open.some((j:any)=>j.scheduled_date>=day)&&<p className="ops-soft-empty">No upcoming open visits. Approved requests are ready to schedule.</p>}</section><section className="white-card"><div className="ops-section-heading"><h3>Recent customer updates</h3><button className="text-link" onClick={()=>onTab('Messages')}>Inbox<ArrowRight size={17}/></button></div>{events.slice(0,5).map((event:any)=><div className="ops-event" key={event.id}><span className="ops-event-dot"/><div><p>{event.message||event.body||event.description||String(event.kind||'Service update').replaceAll('_',' ')}</p><span>{niceDate(event.created_at)}</span></div></div>)}{!events.length&&<p className="ops-soft-empty">Saved quote, scheduling and completion updates will appear here.</p>}</section></div>
  </div>;
}
