import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export function authConfigured(){return !!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)}
export async function authClient(){
 if(!authConfigured())return null;
 const store=await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>store.getAll(),setAll(values){try{values.forEach(({name,value,options})=>store.set(name,value,options))}catch{/* Server components refresh through proxy.ts. */}}}});
}
export async function verifiedUser(){
 const auth=await authClient();if(!auth)return null;
 const {data,error}=await auth.auth.getUser();
 if(error||!data.user?.email||!data.user.email_confirmed_at)return null;
 return data.user;
}
