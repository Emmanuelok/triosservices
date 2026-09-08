import { authClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth-paths';
import { noCache } from '@/lib/server';
import { NextResponse } from 'next/server';
export async function GET(req:Request){
 const url=new URL(req.url),code=url.searchParams.get('code');
 let destination='/sign-in?error=verification';
 try{
  const auth=await authClient();
  if(auth&&code&&code.length<=2048){
   const {data,error}=await auth.auth.exchangeCodeForSession(code);
   if(!error&&data.session&&data.user?.email_confirmed_at&&!data.user.is_anonymous)destination=safeReturnPath(url.searchParams.get('return_to'));
  }
 }catch{/* Keep provider diagnostics and authorization codes out of redirects. */}
 const response=NextResponse.redirect(new URL(destination,url.origin));
 for(const [name,value] of Object.entries(noCache))response.headers.set(name,value);
 response.headers.set('Referrer-Policy','no-referrer');
 return response;
}
