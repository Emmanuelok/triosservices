import { readinessDetails } from '@/lib/readiness';

export const dynamic = 'force-dynamic';
export async function GET() {
  const { configured: _configuration, connected: _connection, ...publicStatus } = await readinessDetails();
  return Response.json(publicStatus, { headers: { 'Cache-Control': 'no-store' } });
}
