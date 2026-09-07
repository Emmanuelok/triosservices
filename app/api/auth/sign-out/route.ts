import { authClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth-paths';
import { sameOrigin,noCache } from '@/lib/server';
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response('Invalid request origin.',{status:403});
 const auth=await authClient();if(auth){const {error}=await auth.auth.signOut({scope:'local'});if(error)return new Response('Sign-out could not be completed. Please try again.',{status:503,headers:noCache})}
 const body=await req.formData();return new Response(null,{status:303,headers:{...noCache,Location:safeReturnPath(String(body.get('returnTo')||'/'),'/')}});
}
