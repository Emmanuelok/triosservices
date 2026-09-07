import { Operations } from '@/components/operations';
import { StaffShell } from '@/components/staff-shell';
import { requireStaffWorkspace } from '@/lib/workspace-access';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Crew workspace · Trios' };
export default async function Page() {
  const { user } = await requireStaffWorkspace('crew');
  return <StaffShell user={user} workspace="crew"><Operations crewMode/></StaffShell>;
}
