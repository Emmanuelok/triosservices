import { Brand } from '@/components/brand';
import { EmailSignIn } from '@/components/email-sign-in';
import { safeReturnPath } from '@/lib/auth-paths';
import { authConfigured,verifiedUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'Secure sign in · Trios'};
export default async function Page({searchParams}:{searchParams:Promise<{return_to?:string;error?:string}>}){
 const params=await searchParams,returnTo=safeReturnPath(params.return_to);
 if(await verifiedUser())redirect(returnTo);
 return <div className="site staff-sign-in"><header className="container staff-sign-in-header"><Brand/><a className="text-link" href="/">Back to Trios</a></header><main className="staff-sign-in-main"><div className="white-card staff-sign-in-card"><div className="eyebrow">YOUR TRIOS ACCOUNT</div><h1>Welcome back.</h1><p>Sign in securely with your email. No password to remember.</p>{params.error&&<div className="error-box" role="alert">That sign-in link could not be verified. Please request a fresh link.</div>}<EmailSignIn configured={authConfigured()} returnTo={returnTo}/></div></main></div>;
}
