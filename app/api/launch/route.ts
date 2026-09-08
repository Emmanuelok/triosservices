import { identity, noCache, fail } from '@/lib/server';
import { readinessDetails } from '@/lib/readiness';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await identity();
    if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401, headers: noCache });
    if (!user.owner) return Response.json({ error: 'Owner access required.' }, { status: 403, headers: noCache });
    return Response.json(await readinessDetails(), { headers: noCache });
  } catch (error) { return fail(error); }
}
