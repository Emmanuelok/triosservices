import { z } from 'zod';
import { validDate, localToday } from './validation';
import type { database } from './postgres-db';

const message = z.string().trim().min(5).max(2000);
export const serviceChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id: z.string().uuid(), jobId: z.string().uuid(), kind: z.enum(['reschedule','cancellation','access','quality']), message, requestedDate: z.union([validDate,z.literal('')]).default(''), requestedWindow: z.string().trim().max(150).default('') }),
  z.object({ action: z.literal('resolve'), id: z.string().uuid(), version: z.number().int().nonnegative(), decision: z.enum(['approved','declined']), resolution: message, jobVersion: z.number().int().nonnegative().optional() }),
  z.object({ action: z.literal('withdraw'), id: z.string().uuid(), version: z.number().int().nonnegative() }),
]);
type Command = z.infer<typeof serviceChangeSchema>;
type User = { id: string; email: string; owner: boolean };
export class ServiceChangeError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function handleServiceChange(db: Pick<typeof database,'transaction'>, user: User, command: Command) {
  return db.transaction(async tx => {
    const now = new Date().toISOString();
    const log = (userId: string, requestId: string, kind: string, body: string) => tx.prepare('INSERT INTO events (id,user_id,request_id,kind,body,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,requestId,kind,body,now).run();
    if (command.action === 'create') {
      const prior = await tx.prepare('SELECT * FROM service_changes WHERE id=?').bind(command.id).first();
      if (prior) {
        if (prior.user_id === user.id && prior.fingerprint === JSON.stringify(command)) return { ok: true, id: prior.id, replayed: true };
        throw new ServiceChangeError('This request identifier is already in use. Refresh and try again.');
      }
      const job = await tx.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').bind(command.jobId,user.id).first();
      if (!job) throw new ServiceChangeError('This service visit was not found.',404);
      if (command.kind !== 'quality' && !['scheduled','in_progress'].includes(job.status)) throw new ServiceChangeError('This visit is already closed. You can still report a service concern.');
      if (command.kind === 'reschedule' && (!command.requestedDate || command.requestedDate < localToday() || command.requestedWindow.length < 2)) throw new ServiceChangeError('Choose today or a later date and include a preferred time window.',400);
      const open = await tx.prepare("SELECT id FROM service_changes WHERE job_id=? AND kind=? AND status='open'").bind(job.id,command.kind).first();
      if (open) throw new ServiceChangeError('There is already an open request of this type for this visit.');
      const count = await tx.prepare('SELECT COUNT(*) AS n FROM service_changes WHERE user_id=? AND created_at>?').bind(user.id,new Date(Date.now()-3600000).toISOString()).first();
      if (Number(count?.n) >= 10) throw new ServiceChangeError('Please wait before sending more service changes, or call Trios.',429);
      await tx.prepare('INSERT INTO service_changes (id,job_id,request_id,user_id,kind,requested_date,requested_window,message,fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(command.id,job.id,job.request_id,user.id,command.kind,command.kind==='reschedule'?command.requestedDate:'',command.kind==='reschedule'?command.requestedWindow:'',command.message,JSON.stringify(command),now,now).run();
      await log(user.id,job.request_id,'change_requested',`Your ${command.kind === 'quality' ? 'service concern' : command.kind} request was received. The current service arrangements remain in place until Trios reviews it.`);
      return { ok: true, id: command.id };
    }

    const item = await tx.prepare('SELECT * FROM service_changes WHERE id=?').bind(command.id).first();
    if (!item || (command.action === 'withdraw' && item.user_id !== user.id)) throw new ServiceChangeError('Service change not found.',404);
    if (command.action === 'resolve' && !user.owner) throw new ServiceChangeError('Only an administrator can review service changes.',403);
    if (item.status !== 'open' || item.version !== command.version) throw new ServiceChangeError('This service change has already been updated. Refresh to see the latest decision.');
    if (command.action === 'withdraw') {
      await tx.prepare("UPDATE service_changes SET status='withdrawn',version=version+1,updated_at=? WHERE id=?").bind(now,item.id).run();
      await log(item.user_id,item.request_id,'change_withdrawn','You withdrew your service change request. Your service arrangements have not changed.');
      return { ok: true, id: item.id };
    }

    if (command.decision === 'approved' && ['reschedule','cancellation','access'].includes(item.kind)) {
      const job = await tx.prepare('SELECT * FROM jobs WHERE id=?').bind(item.job_id).first();
      if (!job || !['scheduled','in_progress'].includes(job.status)) throw new ServiceChangeError('This visit is already closed. Decline this change and explain the current arrangements.');
      if (command.jobVersion === undefined || job.version !== command.jobVersion) throw new ServiceChangeError('The visit changed. Refresh and review its latest date and crew before approving.');
      if (item.kind === 'reschedule') {
        if (item.requested_date < localToday()) throw new ServiceChangeError('The requested date has passed. Decline this request and agree a new date with the customer.');
        await tx.prepare("UPDATE jobs SET scheduled_date=?,time_window=?,status='scheduled',version=? WHERE id=?").bind(item.requested_date,item.requested_window,job.version+1,job.id).run();
      } else if (item.kind === 'cancellation') {
        await tx.prepare("UPDATE jobs SET status='cancelled',notes=?,version=? WHERE id=?").bind([job.notes,`Cancellation approved: ${command.resolution}`].filter(Boolean).join('\n'),job.version+1,job.id).run();
      } else {
        await tx.prepare('UPDATE jobs SET access_notes=?,version=? WHERE id=?').bind(item.message,job.version+1,job.id).run();
      }
    }
    await tx.prepare('UPDATE service_changes SET status=?,resolution=?,resolved_by=?,version=version+1,updated_at=? WHERE id=?').bind(command.decision,command.resolution,user.email,now,item.id).run();
    const result = command.decision === 'approved' && item.kind === 'reschedule' ? `Your visit was moved to ${item.requested_date}, ${item.requested_window}.` : command.decision === 'approved' && item.kind === 'cancellation' ? 'This service visit was cancelled. Invoice or refund arrangements must be agreed separately.' : `Your ${item.kind} request was ${command.decision}.`;
    await log(item.user_id,item.request_id,'change_'+command.decision,`${result} ${command.resolution}`);
    return { ok: true, id: item.id };
  });
}
