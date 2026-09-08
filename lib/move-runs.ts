import { z } from 'zod';
import type { database } from './postgres-db';
import { movingSchema } from './moving';

export const MOVE_STAGES = ['planning','ready','loading','delivery','walkthrough','completed'] as const;
export const MOVE_CHECKLIST = ['access','inventory','protection','load','arrival','walkthrough'] as const;
export const moveRunSchema = z.object({
  jobId: z.string().uuid(), jobVersion: z.number().int().nonnegative(), version: z.number().int().nonnegative(),
  stage: z.enum(MOVE_STAGES), checklist: z.array(z.enum(MOVE_CHECKLIST)).max(6),
  checkedItems: z.array(z.string().uuid()).max(60),
  transportPlan: z.string().trim().max(1500), notes: z.string().trim().max(2500),
}).superRefine((value, ctx) => {
  if (new Set(value.checklist).size !== value.checklist.length || new Set(value.checkedItems).size !== value.checkedItems.length)
    ctx.addIssue({code:'custom',message:'Checklist items must be unique.'});
});
export type MoveRun = {
  job_id: string; version: number; stage: typeof MOVE_STAGES[number]; checklist: string[];
  checkedItems: string[]; transportPlan: string; notes: string; updated_at: string;
};
export function moveRunRecord(row: any): MoveRun {
  return {job_id:row.job_id,version:row.version,stage:row.stage,checklist:JSON.parse(row.checklist),checkedItems:JSON.parse(row.checked_items),transportPlan:row.transport_plan,notes:row.notes,updated_at:row.updated_at};
}
export class MoveRunError extends Error { constructor(message: string, public status = 409) { super(message); } }
type User = {id:string;email:string;owner:boolean};

export async function saveMoveRun(db: Pick<typeof database,'transaction'>, user: User, command: z.infer<typeof moveRunSchema>) {
  return db.transaction(async tx => {
    const job = await tx.prepare('SELECT j.*,r.details,c.email AS crew_email,c.active AS crew_active FROM jobs j JOIN requests r ON r.id=j.request_id LEFT JOIN crew c ON c.id=j.crew_id WHERE j.id=?').bind(command.jobId).first();
    if (!job || job.service !== 'moving' || (!user.owner && (!job.crew_active || String(job.crew_email).toLowerCase() !== user.email.toLowerCase())))
      throw new MoveRunError('This move was not found or is not assigned to you.',403);
    if (job.version !== command.jobVersion) throw new MoveRunError('This visit changed. Refresh the move to review its latest assignment and access notes.');
    if (['completed','cancelled'].includes(job.status)) throw new MoveRunError('This move is closed. Use a service concern or message to record a follow-up.');
    const prior = await tx.prepare('SELECT * FROM move_runs WHERE job_id=?').bind(job.id).first();
    if ((prior?.version || 0) !== command.version) throw new MoveRunError('Another team member updated this move. Refresh before saving.');
    const previousStage = prior?.stage || 'planning';
    const before = MOVE_STAGES.indexOf(previousStage), after = MOVE_STAGES.indexOf(command.stage);
    if (after < before || after > before + 1) throw new MoveRunError('Complete each move stage in order. Stages cannot be skipped or reversed.');
    const parsed = movingSchema.safeParse(JSON.parse(job.details || '{}').moving);
    if (!parsed.success) throw new MoveRunError('This request needs a complete moving brief before move-day work can be recorded.');
    const moving = parsed.data;
    const inventoryIds = moving.inventory.map(item => item.id);
    if (command.checkedItems.some(id => !inventoryIds.includes(id))) throw new MoveRunError('An inventory item does not belong to this move.',400);
    if (!user.owner && command.transportPlan !== (prior?.transport_plan || '')) throw new MoveRunError('Only an administrator can confirm or change transport arrangements.',403);
    if (before >= 2 && command.transportPlan !== (prior?.transport_plan || '')) throw new MoveRunError('Transport arrangements are locked once loading starts. Record any exception in the shared notes.');
    if (after >= 1 && moving.transport === 'Request transport' && command.transportPlan.length < 15)
      throw new MoveRunError('An administrator must record the agreed transport arrangements before marking this move ready.');
    if (after >= 2 && !['access','inventory','protection'].every(key => command.checklist.includes(key as any)))
      throw new MoveRunError('Confirm access, the agreed inventory and protection before loading begins.');
    if (after >= 3 && !command.checklist.includes('load')) throw new MoveRunError('Account for the agreed load before recording delivery.');
    if (after >= 4 && !command.checklist.includes('arrival')) throw new MoveRunError('Confirm arrival and placement before the walkthrough.');
    if (after === 5 && (!MOVE_CHECKLIST.every(key => command.checklist.includes(key)) || inventoryIds.some(id => !command.checkedItems.includes(id))))
      throw new MoveRunError('Complete the checklist and account for every inventory line before closing the move. Record any exceptions in the shared notes.');
    const now = new Date().toISOString(), version = command.version + 1;
    await tx.prepare('INSERT INTO move_runs (job_id,version,stage,checklist,checked_items,transport_plan,notes,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET version=excluded.version,stage=excluded.stage,checklist=excluded.checklist,checked_items=excluded.checked_items,transport_plan=excluded.transport_plan,notes=excluded.notes,updated_at=excluded.updated_at,updated_by=excluded.updated_by')
      .bind(job.id,version,command.stage,JSON.stringify(command.checklist),JSON.stringify(command.checkedItems),command.transportPlan,command.notes,now,user.email).run();
    let jobVersion = job.version;
    if ((after >= 2 && job.status === 'scheduled') || after === 5) {
      await tx.prepare('UPDATE jobs SET status=?,completed_at=?,version=? WHERE id=?').bind(after===5?'completed':'in_progress',after===5?now:null,++jobVersion,job.id).run();
    }
    if (previousStage !== command.stage) {
      const label = {planning:'planning',ready:'ready',loading:'loading / handling underway',delivery:'delivery / placement underway',walkthrough:'final walkthrough',completed:'completed'}[command.stage];
      await tx.prepare('INSERT INTO events (id,user_id,request_id,kind,body,created_at) VALUES (?,?,?,?,?,?)')
        .bind(crypto.randomUUID(),job.user_id,job.request_id,'move_progress',`Your moving team recorded: ${label}. See your move workspace for the latest details.`,now).run();
    }
    return {ok:true,jobVersion,run:{job_id:job.id,version,stage:command.stage,checklist:command.checklist,checkedItems:command.checkedItems,transportPlan:command.transportPlan,notes:command.notes,updated_at:now}};
  });
}
