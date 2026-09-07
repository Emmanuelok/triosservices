'use client';
import { useState } from 'react';
import { ArrowRight,Mail,Loader2 } from 'lucide-react';
export function EmailSignIn({returnTo,configured}:{returnTo:string;configured:boolean}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{
  const response=await fetch('/api/auth/'+(sent?'verify':'email'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code,returnTo}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Sign-in could not be completed.');
  if(sent)window.location.assign(data.returnTo);else setSent(true);
 }catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{setBusy(false)}}
 if(!configured)return <div className="notice warning" role="status">Online accounts are being connected. Please contact Trios for help with a quote or existing service.</div>;
 return <form onSubmit={submit} className="email-sign-in-form">
  {sent?<><div className="notice" role="status"><Mail size={22}/><div>Check your email for a secure sign-in link. Keep this tab open. If your email includes a verification code, you can enter it below.</div></div><label htmlFor="email-code">Verification code<input id="email-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required/></label></>:<label htmlFor="sign-in-email">Email address<input id="sign-in-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com"/></label>}
  {error&&<div className="error-box" role="alert">{error}</div>}
  <button className="button full" disabled={busy}>{busy?<Loader2 className="spin" size={20}/>:null}{sent?'Verify and sign in':'Email me a sign-in link'}<ArrowRight size={18}/></button>
  {sent&&<button type="button" className="text-link" onClick={()=>{setSent(false);setCode('');setError('')}}>Use another email or resend</button>}
  <p className="small-text">Your account’s permissions determine which workspace you can open.</p>
 </form>;
}
