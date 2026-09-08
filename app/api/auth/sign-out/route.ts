import { authClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth-paths';
import { sameOrigin,noCache,fail } from '@/lib/server';
import { boundedBody,BodyError } from '@/lib/request-body';
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response('Invalid request origin.',{status:403,headers:noCache});
 try{
  // Validate the bounded form before changing the session. A malformed or very
  // large request must not sign out a user and then fail while reading its body.
  const bytes=await boundedBody(req,4096);
  let body:FormData;
  try{body=await new Response(bytes as BodyInit,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData()}
  catch{throw new BodyError('Please submit a valid sign-out form.',400)}
  const returnTo=body.get('returnTo');
  if(returnTo!==null&&typeof returnTo!=='string')throw new BodyError('Please submit a valid sign-out form.',400);
  const auth=await authClient();
  if(auth){const {error}=await auth.auth.signOut({scope:'local'});if(error)return new Response('Sign-out could not be completed. Please try again.',{status:503,headers:noCache})}
  return new Response(null,{status:303,headers:{...noCache,Location:safeReturnPath(returnTo||'/','/')}});
 }catch(error){
  if(error instanceof BodyError)return fail(error);
  return new Response('Sign-out could not be completed. Please try again.',{status:503,headers:noCache});
 }
}
