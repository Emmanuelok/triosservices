import { identity, sql, noCache, sameOrigin, fail } from '@/lib/server';
import { boundedJson } from '@/lib/request-body';
import { moveRunSchema, moveRunRecord, saveMoveRun, MoveRunError } from '@/lib/move-runs';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const user = await identity();
    if (!user) return Response.json({error:'Please sign in.'},{status:401,headers:noCache});
    const mode = new URL(req.url).searchParams.get('mode') || 'customer';
    if (!['admin','crew','customer'].includes(mode)) return Response.json({error:'Unknown workspace.'},{status:400,headers:noCache});
    if (mode === 'admin' && !user.owner) return Response.json({error:'Owner access required.'},{status:403,headers:noCache});
    const crew = mode === 'crew' && !user.owner ? await sql().prepare('SELECT id FROM crew WHERE lower(email)=? AND active=1').bind(user.email.toLowerCase()).first() : null;
    if (mode === 'crew' && !user.owner && !crew) return Response.json({error:'An active crew assignment is required.'},{status:403,headers:noCache});
    const all = user.owner && (mode === 'admin' || mode === 'crew');
    const clause = all ? '' : mode === 'crew' ? ' AND j.crew_id=?' : ' AND j.user_id=?';
    const rows = await sql().prepare("SELECT m.* FROM move_runs m JOIN jobs j ON j.id=m.job_id WHERE j.service='moving'"+clause+' ORDER BY m.updated_at DESC LIMIT 1000').bind(...(all?[]:[mode==='crew'?crew.id:user.id])).all();
    return Response.json({runs:rows.results.map(moveRunRecord)},{headers:noCache});
  } catch (error) { return fail(error); }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return Response.json({error:'Invalid request origin.'},{status:403,headers:noCache});
    const user = await identity();
    if (!user) return Response.json({error:'Please sign in.'},{status:401,headers:noCache});
    const parsed = moveRunSchema.safeParse(await boundedJson(req,16000));
    if (!parsed.success) return Response.json({error:parsed.error.issues.map(issue=>issue.message).join(' ')},{status:400,headers:noCache});
    return Response.json(await saveMoveRun(sql(),user,parsed.data),{headers:noCache});
  } catch (error) {
    if (error instanceof MoveRunError) return Response.json({error:error.message},{status:error.status,headers:noCache});
    return fail(error);
  }
}
