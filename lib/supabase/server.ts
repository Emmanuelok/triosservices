import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export function authConfigured(){return !!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)}
export async function authClient(){
 if(!authConfigured())return null;
 const store=await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>store.getAll(),setAll(values){try{values.forEach(({name,value,options})=>store.set(name,value,options))}catch{/* Server components refresh through proxy.ts. */}}}});
}
export async function verifiedUser(){
 try{
  const auth=await authClient();if(!auth)return null;
  const {data,error}=await auth.auth.getUser();
  if(error||!data.user?.id||!data.user.email||!data.user.email_confirmed_at||data.user.is_anonymous)return null;
  return data.user;
 }catch{
  // Provider/network outages cannot turn an unverified cookie into an identity.
  console.error('Trios identity verification unavailable');
  return null;
 }
}
