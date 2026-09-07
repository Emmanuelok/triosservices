import { authClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth-paths';
import { NextResponse } from 'next/server';
export async function GET(req:Request){
 const url=new URL(req.url),code=url.searchParams.get('code');
 const auth=await authClient();
 if(auth&&code){const {error}=await auth.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get('return_to')),url.origin))}
 return NextResponse.redirect(new URL('/sign-in?error=verification',url.origin));
}
