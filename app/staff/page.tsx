import { redirect } from 'next/navigation';
import { workspaceSession } from '@/lib/workspace-access';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const session = await workspaceSession();
  redirect(session?.role === 'admin' ? '/operations' : session?.role === 'crew' ? '/crew' : '/staff/sign-in');
}
