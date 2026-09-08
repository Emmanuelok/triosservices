'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import { ErrorNotice, Notice } from './shared';

export function LaunchReadiness() {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch('/api/launch', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) { setState(null); throw new Error('Connection status could not be loaded.'); }
      setState(await response.json()); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to check connections.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { refresh(); }, []);
  const checks = state ? [
    ['Customer sign-in', state.configured.auth, 'Provider settings configured; verify a real email sign-in before launch.'],
    ['Property database', state.connected.database, 'Checked against the current database connection.'],
    ['Service workflow schema', state.connected.schema, 'All published database migrations must be applied.'],
    ['Administrator access', state.configured.owner, 'Owner email allowlist configured on the server.'],
    ['Production address', state.configured.origin, 'Production origin configured for sign-in redirects and request protection.'],
    ['Private photo storage', state.connected.storage, 'The dedicated photo bucket must be reachable and private. Verify a complete upload before launch.'],
    ['Optional AI provider', state.configured.ai, 'Service assistants and guided planning remain available without this connection.'],
  ] as const : [];
  return <section className="white-card launch-readiness" aria-label="Business connection status">
    <div className="section-head"><div><div className="eyebrow">LAUNCH READINESS</div><h3>Know what is connected.</h3></div><button className="button small outline" type="button" disabled={busy} onClick={refresh}><RefreshCw size={18}/>{busy ? 'Checking…' : 'Check again'}</button></div>
    {error && <ErrorNotice message={error}/>}<div aria-live="polite">{checks.map(([name, ready, note]) => <div className="launch-check" key={name}>{ready ? <CheckCircle2 size={23}/> : <CircleAlert size={23}/>}<div><strong>{name}</strong><p>{note}</p></div><span className={'pill' + (ready ? '' : ' warning')}>{ready ? 'Configured' : 'Needs attention'}</span></div>)}</div>
    {state && <p className="small-text">Last checked {new Date(state.checkedAt).toLocaleTimeString('en-CA')}. A configuration check does not verify email delivery or a full customer transaction.</p>}
    <Notice>Before accepting customers, complete a real sign-in, quote approval, crew assignment, private photo upload, invoice and verified payment in your dedicated project. Email delivery requires your production sender. Card charging and SMS are not connected.</Notice>
  </section>;
}
