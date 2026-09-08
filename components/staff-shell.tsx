'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, LogOut, ArrowUpRight, WifiOff, Phone } from 'lucide-react';
import { Brand } from './brand';
import { useData } from './shared';
import { Toaster } from '@/components/ui/sonner';
import { CONTACT } from '@/lib/catalog';

export function StaffShell({ user, workspace, children }: {
  user: { id: string; email: string; name: string };
  workspace: 'admin' | 'crew';
  children: React.ReactNode;
}) {
  const { data, error, loading, refresh } = useData('identity');
  const [signingOut, setSigningOut] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const allowed = data?.user?.id === user.id &&
    (data.user.owner || (workspace === 'crew' && data.isCrew));
  return <div className={'site site-page-' + (workspace === 'admin' ? 'operations' : 'crew')}>
    <a className="skip-link" href="#main-content">Skip to workspace</a>
    <header className="staff-header"><div className="container staff-header-inner">
      <Brand/>
      <div className="staff-account"><span className="staff-role"><ShieldCheck size={20}/>{workspace === 'admin' ? 'Admin workspace' : 'Crew workspace'}</span>
        <span className="staff-email">{user.email}</span></div>
      <div className="staff-links"><a className="button outline staff-public-link" href="/">View website<ArrowUpRight size={18}/></a><a className="button outline" target="_top" href="/sign-out?return_to=%2Fstaff%2Fsign-in" onClick={() => setSigningOut(true)}><LogOut size={18}/>Sign out</a></div>
    </div></header>
    <main id="main-content">{signingOut ? <div className="container section" role="status">Signing out…</div>
      : loading && !data ? <div className="container section" role="status">Checking your staff access…</div>
      : !allowed ? <div className="container section"><div className="white-card">
        <h1 className="section-title">Staff access required</h1><p>{error || 'Your sign-in no longer has access to this workspace.'}</p>
        <div className="button-row"><a className="button" href="/staff/sign-in">Staff sign in</a>{error && <button className="button outline" onClick={refresh}>Try again</button>}</div>
      </div></div> : <>{offline && <div className="container" style={{paddingTop:24}}><div className="notice warning" role="status"><WifiOff size={22}/><span>You’re offline. Reconnect before saving visit updates. Keep this page open to retain unsaved work.</span></div></div>}{error && <div className="container" style={{paddingTop:24}}><div className="notice warning" role="status">Access refresh is temporarily unavailable. Your unsaved work is still here. <button className="text-link" onClick={refresh}>Try again</button></div></div>}{children}</>}</main>
    <footer className="staff-footer container"><span>Trios Snow and Mowing Inc. · St. John’s</span><a className="text-link" href={'tel:'+CONTACT.phone}><Phone size={18}/>Contact Trios</a></footer>
    <Toaster position="bottom-right" richColors closeButton/>
  </div>;
}
