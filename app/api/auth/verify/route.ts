import { authClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth-paths';
import { sameOrigin,noCache } from '@/lib/server';
import { boundedJson } from '@/lib/request-body';
import { z } from 'zod';
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid request origin.'},{status:403});
 const auth=await authClient();if(!auth)return Response.json({error:'Online sign-in is not connected yet.'},{status:503,headers:noCache});
 try{const p=z.object({email:z.string().trim().email().max(200),code:z.string().regex(/^\d{6,10}$/),returnTo:z.string().max(500).optional()}).parse(await boundedJson(req,3000));
  const {error}=await auth.auth.verifyOtp({email:p.email,token:p.code,type:'email'});
  if(error)return Response.json({error:'That code is invalid or expired. Request a fresh sign-in email.'},{status:400,headers:noCache});
  return Response.json({ok:true,returnTo:safeReturnPath(p.returnTo)},{headers:noCache});
 }catch{return Response.json({error:'Enter the verification code from your email.'},{status:400,headers:noCache})}
}
