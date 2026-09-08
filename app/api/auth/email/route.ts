import { authClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth-paths';
import { sameOrigin,noCache,fail } from '@/lib/server';
import { boundedJson,BodyError } from '@/lib/request-body';
import { z } from 'zod';
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid request origin.'},{status:403,headers:noCache});
 try{
  const p=z.object({email:z.string().trim().email().max(200),returnTo:z.string().max(500).optional()}).parse(await boundedJson(req,3000));
  const auth=await authClient();if(!auth)return Response.json({error:'Online sign-in is not connected yet. Please contact Trios.'},{status:503,headers:noCache});
  const callback=new URL('/auth/callback',process.env.SITE_ORIGIN||new URL(req.url).origin);callback.searchParams.set('return_to',safeReturnPath(p.returnTo));
  const {error}=await auth.auth.signInWithOtp({email:p.email,options:{emailRedirectTo:callback.toString(),shouldCreateUser:true}});
  if(error)return Response.json({error:'A sign-in link could not be sent. Please wait a moment and try again.'},{status:error.status===429?429:503,headers:noCache});
  return Response.json({ok:true},{headers:noCache});
 }catch(error){
  if(error instanceof BodyError)return fail(error);
  if(error instanceof z.ZodError)return Response.json({error:'Enter a valid email address.'},{status:400,headers:noCache});
  return Response.json({error:'Sign-in is temporarily unavailable. Please try again shortly.'},{status:503,headers:noCache});
 }
}
