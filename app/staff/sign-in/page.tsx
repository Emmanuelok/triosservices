import { ShieldCheck, ArrowRight } from 'lucide-react';
import { Brand } from '@/components/brand';
import { workspaceSession } from '@/lib/workspace-access';
import { chatGPTSignInPath, chatGPTSignOutPath } from '@/app/chatgpt-auth';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff sign in · Trios' };
export default async function Page() {
  const session = await workspaceSession();
  const eligible = session && session.role !== 'customer';
  return <div className="site staff-sign-in">
    <header className="container staff-sign-in-header"><Brand/><a className="text-link" href="/">Back to Trios</a></header>
    <main className="staff-sign-in-main"><div className="white-card staff-sign-in-card">
      <span className="icon-box"><ShieldCheck size={30}/></span>
      <div className="eyebrow">TRIOS TEAM</div><h1>Staff sign in.</h1>
      <p>One secure sign-in for your workday. Your account opens the workspace assigned to you.</p>
      {session ? <>
        <div className="staff-sign-in-account"><span>Signed in as</span><strong>{session.user.email}</strong></div>
        {eligible ? <a className="button full" href="/staff">Open {session.role === 'admin' ? 'admin' : 'crew'} workspace <ArrowRight size={20}/></a>
          : <div className="notice warning" role="alert">This account does not have staff access. Ask the business owner to confirm your staff account.</div>}
        <a className="button outline full" target="_top" href={chatGPTSignOutPath('/staff/sign-in')}>Sign out and use another account</a>
      </> : <a className="button full" target="_top" href={chatGPTSignInPath('/staff')}>Sign in securely <ArrowRight size={20}/></a>}
      <p className="staff-sign-in-note">Looking after your own property? <a className="text-link" href="/portal">Customer sign in</a></p>
    </div></main>
    <footer className="staff-footer container">Trios Snow and Mowing Inc. · St. John’s</footer>
  </div>;
}
