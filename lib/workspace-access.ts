import { redirect } from 'next/navigation';
import { identity, sql } from './server';

// Roles come only from the verified sign-in and the server-managed staff roster.
export async function workspaceSession() {
  const user = await identity();
  if (!user) return null;
  if (user.owner) return { user, role: 'admin' as const };
  const crew = await sql().prepare('SELECT id FROM crew WHERE lower(email)=? AND active=1')
    .bind(user.email.toLowerCase()).first();
  return { user, role: crew ? 'crew' as const : 'customer' as const };
}

export async function requireStaffWorkspace(workspace: 'admin' | 'crew') {
  const session = await workspaceSession();
  if (!session || session.role === 'customer') redirect('/staff/sign-in');
  if (workspace === 'admin' && session.role !== 'admin') redirect('/crew');
  return session;
}
