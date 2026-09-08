import { identity, sql, noCache, sameOrigin, fail } from '@/lib/server';
import { boundedJson } from '@/lib/request-body';
import { handleServiceChange, serviceChangeSchema, ServiceChangeError } from '@/lib/service-changes';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const user = await identity();
    if (!user) return Response.json({error:'Please sign in.'},{status:401,headers:noCache});
    const mode = new URL(req.url).searchParams.get('mode');
    if (mode === 'admin' && !user.owner) return Response.json({error:'Owner access required.'},{status:403,headers:noCache});
    const admin = mode === 'admin' && user.owner;
    const result = await sql().prepare('SELECT s.id,s.job_id,s.request_id,s.kind,s.requested_date,s.requested_window,s.message,s.status,s.resolution,s.version,s.created_at,s.updated_at,r.address,r.customer_name,j.service,j.scheduled_date,j.time_window,j.version AS job_version,j.status AS job_status FROM service_changes s JOIN requests r ON r.id=s.request_id JOIN jobs j ON j.id=s.job_id '+(admin?'':'WHERE s.user_id=? ')+'ORDER BY s.created_at DESC LIMIT 500').bind(...(admin?[]:[user.id])).all();
    return Response.json({items:result.results},{headers:noCache});
  } catch (error) { return fail(error); }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return Response.json({error:'Invalid request origin.'},{status:403,headers:noCache});
    const user = await identity();
    if (!user) return Response.json({error:'Please sign in.'},{status:401,headers:noCache});
    const parsed = serviceChangeSchema.safeParse(await boundedJson(req,16000));
    if (!parsed.success) return Response.json({error:parsed.error.issues.map(i=>i.message).join(' ')},{status:400,headers:noCache});
    if (parsed.data.action === 'resolve' && !user.owner) return Response.json({error:'Owner access required.'},{status:403,headers:noCache});
    return Response.json(await handleServiceChange(sql(),user,parsed.data),{headers:noCache});
  } catch (error) {
    if (error instanceof ServiceChangeError) return Response.json({error:error.message},{status:error.status,headers:noCache});
    return fail(error);
  }
}
