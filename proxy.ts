import { createServerClient } from '@supabase/ssr';
import { NextResponse,type NextRequest } from 'next/server';
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request});
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY){
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>request.cookies.getAll(),setAll(values){values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options))}}});
  try{await auth.auth.getUser()}catch{
   // Route-level verification still fails closed. Keep private/no-store headers
   // on the response even while the identity provider is temporarily unavailable.
   console.error('Trios session refresh unavailable');
  }
 }
 response.headers.set('Cache-Control','private, no-store, max-age=0');
 response.headers.set('Pragma','no-cache');
 return response;
}
export const config={matcher:['/operations/:path*','/crew/:path*','/portal/:path*','/staff/:path*','/sign-in','/sign-out','/auth/:path*','/api/:path*']};
