import { Brand } from '@/components/brand';
import { safeReturnPath } from '@/lib/auth-paths';
export const dynamic='force-dynamic';
export const metadata={title:'Sign out · Trios'};
export default async function Page({searchParams}:{searchParams:Promise<{return_to?:string}>}){
 const {return_to}=await searchParams;
 return <div className="site staff-sign-in"><header className="container staff-sign-in-header"><Brand/></header><main className="staff-sign-in-main"><div className="white-card staff-sign-in-card"><h1>Sign out?</h1><p>Your saved requests and work records will be here when you return.</p><form action="/api/auth/sign-out" method="post"><input type="hidden" name="returnTo" value={safeReturnPath(return_to,'/')}/><button className="button full">Sign out of this account</button></form></div></main></div>;
}
