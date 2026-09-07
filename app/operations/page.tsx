import { Operations } from '@/components/operations';
import { StaffShell } from '@/components/staff-shell';
import { requireStaffWorkspace } from '@/lib/workspace-access';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Business operations · Trios' };
export default async function Page() {
  const { user } = await requireStaffWorkspace('admin');
  return <StaffShell user={user} workspace="admin"><Operations/></StaffShell>;
}
