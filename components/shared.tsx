'use client';
import { useState,useEffect,useCallback,useRef } from 'react';
import { Snowflake, Leaf, Sun, Wind, Flower2, Sprout, Scissors, Footprints, Droplets, Truck, Recycle, Armchair, Sparkles, House, Loader2, Upload, X, Info } from 'lucide-react';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
export const ICONS:any={snow:Snowflake,leaf:Leaf,sun:Sun,wind:Wind,flower:Flower2,sprout:Sprout,scissors:Scissors,footprints:Footprints,droplets:Droplets,truck:Truck,recycle:Recycle,armchair:Armchair,sparkles:Sparkles,home:House};
export function ServiceIcon({name,size=24}:{name:string;size?:number}){const Icon=ICONS[name]||Leaf;return <Icon size={size} strokeWidth={1.7}/>}
export function Pick({value,onChange,options,label,id,disabled=false}:{value:string;onChange:(v:string)=>void;options:(string|{value:string;label:string})[];label?:string;id?:string;disabled?:boolean}){return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} className="control-select" aria-label={label||'Choose an option'}><SelectValue placeholder="Select an option"/></SelectTrigger><SelectContent>{options.map(o=>{const v=typeof o==='string'?o:o.value;return <SelectItem value={v} key={v}>{typeof o==='string'?o:o.label}</SelectItem>})}</SelectContent></Select>}
export function useData(mode='customer'){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const revision=useRef(0),mounted=useRef(true),account=useRef<string|null>(null);
 const refresh=useCallback(async()=>{
  const current=++revision.current;
  setLoading(true);
  try{
   const r=await fetch('/api/data?mode='+mode,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   // Clear previously loaded records even when an expired sign-in returns HTML.
   if(r.status===401||r.status===403){
    if(mounted.current&&current===revision.current)setData(null);
    throw Error(r.status===401?'Your sign-in has expired. Please sign in again.':'Your account no longer has access to this workspace.');
   }
   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Unable to load your records.');
   if(mounted.current&&current===revision.current){
    if(account.current&&d.user&&account.current!==d.user.id){
     setData(null);setError('Your sign-in changed. Reloading your workspace…');
     window.location.reload();return;
    }
    // Remember the last account across sign-out so another user's session
    // cannot revive locally retained dialogs from the previous account.
    if(d.user)account.current=d.user.id;
    setData(d);setError('');
   }
  }catch(e){if(mounted.current&&current===revision.current)setError(e instanceof Error?e.message:'Unable to load your records.')}
  finally{if(mounted.current&&current===revision.current)setLoading(false)}
 },[mode]);
 useEffect(()=>{
  mounted.current=true;refresh();
  const onFocus=()=>{if(document.visibilityState==='visible')refresh()};
  const onPageShow=(event:PageTransitionEvent)=>{if(event.persisted){setData(null);refresh()}};
  const onSignOut=()=>{++revision.current;setData(null);setError('');setLoading(false)};
  window.addEventListener('focus',onFocus);window.addEventListener('online',onFocus);
  window.addEventListener('pageshow',onPageShow);window.addEventListener('trios:signout',onSignOut);
  const timer=window.setInterval(onFocus,60000);
  return()=>{mounted.current=false;++revision.current;window.clearInterval(timer);window.removeEventListener('focus',onFocus);window.removeEventListener('online',onFocus);window.removeEventListener('pageshow',onPageShow);window.removeEventListener('trios:signout',onSignOut)};
 },[refresh]);
 return{data,error,loading,refresh};
}
export async function saveData(payload:any){const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save. Please try again.');return d}
export function Loading(){return <div className="loading"><Loader2 className="spin" size={25} style={{margin:'0 auto 12px'}}/>Loading your property details…</div>}
export function Empty({title,children,action}:{title:string;children:React.ReactNode;action?:React.ReactNode}){return <div className="white-card empty-state"><House size={35} strokeWidth={1.4}/><h3>{title}</h3><p>{children}</p>{action}</div>}
export function ErrorNotice({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert">{message}{retry&&<button className="button small outline" onClick={retry} style={{marginLeft:15}}>Try again</button>}</div>}
export function SignIn({returnTo='/portal'}:{returnTo?:string}){return <Empty title="Your property, in one place" action={<a className="button" target="_top" href={'/sign-in?return_to='+encodeURIComponent(returnTo)}>Sign in securely</a>}>Sign in to save a property, request services and securely view your quotes, visits and invoices.</Empty>}
export function Notice({children,warning=false}:{children:React.ReactNode;warning?:boolean}){return <div className={'notice'+(warning?' warning':'')}><Info size={19}/><div>{children}</div></div>}
export function UploadPhotos({photos,onChange}:{photos:string[];onChange:(v:string[])=>void}){const [busy,setBusy]=useState(false);async function upload(files:FileList|null){if(!files)return;setBusy(true);try{const next=[...photos];for(const file of Array.from(files).slice(0,6-photos.length)){if(file.size>4*1024*1024)throw Error('Choose a photo under 4 MB.');const fd=new FormData();fd.set('file',file);const r=await fetch('/api/upload',{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw Error(d.error);next.push(d.id);onChange([...next])}}catch(e){toast.error(e instanceof Error?e.message:'Photo upload failed')}finally{setBusy(false)}}return <div className="field"><label>Property photos <span className="muted" style={{fontWeight:400}}>(optional)</span></label><p className="small-text">Up to 6 JPG, PNG or WebP images, 4 MB each.</p><label className="button outline" style={{width:'fit-content',marginTop:6}}><Upload size={17}/>{busy?'Adding photos…':'Add photos'}<input style={{display:'none'}} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||photos.length>=6} onChange={e=>{upload(e.target.files);e.target.value=''}}/></label><div className="photo-thumbs">{photos.map(id=><div key={id} style={{position:'relative'}}><img src={'/api/files/'+id} alt="Uploaded property photo"/><button type="button" className="photo-remove" aria-label="Remove photo from request" onClick={()=>onChange(photos.filter(x=>x!==id))}><X size={13}/></button></div>)}</div></div>}
