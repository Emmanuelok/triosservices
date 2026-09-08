import { z } from 'zod';
import { sql, event, identity } from './server';
import { SERVICES, snowEstimate } from './catalog';
import { movingSchema } from './moving';
import { currency, validDate, localToday } from './validation';
const text = (min=1,max=500)=>z.string().trim().min(min).max(max);
export const settingsSchema=z.object({quoteTerms:text(0,4000),paymentInstructions:text(0,2000),dailyCapacity:z.number().int().min(1).max(100),invoiceDays:z.number().int().min(0).max(90)});
export const defaults={quoteTerms:'',paymentInstructions:'Contact Trios to confirm e-transfer recipient details before sending payment.',dailyCapacity:12,invoiceDays:7};
export const operationsSchemas={
 intake:z.object({action:z.literal('intake'),id:z.string().uuid(),name:text(2,100),email:z.string().email().max(200),phone:text(7,30),address:text(5,250),area:text(2,100),postalCode:text(6,8).regex(/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ][ -]?\d[ABCEGHJ-NPRSTVWXYZ]\d$/i),services:z.array(z.string().refine(s=>SERVICES.some(v=>v.id===s))).min(1).max(SERVICES.length),frequency:text(2,60),source:z.enum(['Phone','Email','In person']),notes:text(0,2000),moving:movingSchema.optional(),consent:z.literal(true)}).superRefine((value,ctx)=>{if(value.services.includes('moving')){if(!value.moving)ctx.addIssue({code:'custom',path:['moving'],message:'Complete the moving plan.'});else{if(value.moving.origin.address!==value.address)ctx.addIssue({code:'custom',path:['address'],message:'The collection address must match the property address.'});if(value.moving.moveDate<localToday())ctx.addIssue({code:'custom',path:['moving','moveDate'],message:'Choose today or a later moving date.'});}}}),
 offline_approval:z.object({action:z.literal('offline_approval'),id:z.string().uuid(),quoteVersion:text(1,100),signer:text(2,100),method:z.enum(['Phone','Email','Signed document','In person']),evidence:text(15,2000),confirmed:z.literal(true)}),
 settings:z.object({action:z.literal('settings'),...settingsSchema.shape}),
 dispatch:z.object({action:z.literal('dispatch'),commandId:z.string().uuid(),crewId:z.string().uuid(),jobs:z.array(z.object({id:z.string().uuid(),version:z.number().int().min(0)})).min(1).max(100)}),
 payment:z.object({action:z.literal('payment'),id:z.string().uuid(),commandId:z.string().uuid(),amount:currency.optional(),method:z.enum(['E-transfer','Cash','Cheque','External card terminal']).default('E-transfer'),receivedDate:validDate.optional(),reference:text(3,150)}),
};
export async function loadSettings(){const row=await sql().prepare("SELECT value FROM business_settings WHERE id='operations'").first();return row?{...defaults,...JSON.parse(row.value)}:defaults;}
// Only the email provided by the hosting authentication boundary can claim offline records.
export async function linkCustomer(user:NonNullable<Awaited<ReturnType<typeof identity>>>){
 const db=sql();const c=await db.prepare('SELECT * FROM contacts WHERE email=? AND (user_id IS NULL OR user_id=?)').bind(user.email.toLowerCase(),user.id).first();
 if(!c)return;const pending='contact:'+c.id;
 const batch=[db.prepare('UPDATE contacts SET user_id=? WHERE id=? AND (user_id IS NULL OR user_id=?)').bind(user.id,c.id,user.id)];
 for(const table of ['requests','properties','jobs','invoices','events'])batch.push(db.prepare(`UPDATE ${table} SET user_id=? WHERE user_id=? AND EXISTS(SELECT 1 FROM contacts WHERE id=? AND user_id=?)`).bind(user.id,pending,c.id,user.id));
 await db.batch(batch);
}
export async function commandReceipt(p:any){if(!p.commandId)return null;const existing=await sql().prepare('SELECT * FROM commands WHERE id=?').bind(p.commandId).first();if(!existing)return null;return existing.fingerprint===JSON.stringify(p)?Response.json({ok:true,replayed:true}):Response.json({error:'This action changed after it was submitted. Close the form and start again.'},{status:409});}
export function commandStatement(p:any){return sql().prepare('INSERT INTO commands (id,action,fingerprint,created_at) VALUES (?,?,?,?)').bind(p.commandId||crypto.randomUUID(),p.action,JSON.stringify(p),new Date().toISOString());}
const conflict=(error:string)=>Response.json({error},{status:409});
export async function handleOperations(p:any,user:NonNullable<Awaited<ReturnType<typeof identity>>>){
 const db=sql(),now=new Date().toISOString();
 if(p.action==='intake'){
  const prior=await db.prepare('SELECT id FROM requests WHERE id=?').bind(p.id).first();if(prior)return Response.json({ok:true,id:p.id,replayed:true});
  const email=p.email.toLowerCase();let c=await db.prepare('SELECT * FROM contacts WHERE email=?').bind(email).first();
  if(!c){const id=crypto.randomUUID();await db.prepare('INSERT OR IGNORE INTO contacts (id,name,email,phone,notes,created_at) VALUES (?,?,?,?,?,?)').bind(id,p.name,email,p.phone,p.notes,now).run();c=await db.prepare('SELECT * FROM contacts WHERE email=?').bind(email).first();}
  const ownerId=c.user_id||'contact:'+c.id;
  const details={drivewaySize:'large',salt:false,walkway:false,priority:false,photos:[],access:p.notes,source:p.source,surface:'To assess',slope:'To assess',...(p.services.includes('moving')?{moving:p.moving}: {})};
  await db.batch([db.prepare('INSERT INTO requests (id,user_id,customer_name,email,phone,address,area,postal_code,services,frequency,details,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(p.id,ownerId,p.name,email,p.phone,p.address,p.area,p.postalCode.toUpperCase(),JSON.stringify([...new Set(p.services)]),p.frequency,JSON.stringify(details),'requested',now,now),event(ownerId,p.id,'requested',`${p.source} service request recorded by Trios. Scope and price await review.`)]);
  return Response.json({ok:true,id:p.id},{status:201});
 }
 if(p.action==='offline_approval'){
  const r=await db.prepare('SELECT * FROM requests WHERE id=?').bind(p.id).first();if(!r||r.status!=='quoted'||r.updated_at!==p.quoteVersion)return conflict('The quote changed. Refresh and review it before recording approval.');
  // An insertion trigger below guards concurrent quote changes atomically with this batch.
  await db.batch([db.prepare('INSERT INTO approvals (id,request_id,signer,method,evidence,quote_total,quote_terms,recorded_by,created_at,quote_version) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),p.id,p.signer,p.method,p.evidence,r.quote_total,r.quote_terms,user.email,now,p.quoteVersion),db.prepare("UPDATE requests SET status='accepted',updated_at=? WHERE id=? AND status='quoted' AND updated_at=?").bind(now,p.id,p.quoteVersion),event(r.user_id,p.id,'approval_recorded',`Trios recorded ${p.method.toLowerCase()} approval from ${p.signer}. Evidence: ${p.evidence}`)]);
  return Response.json({ok:true});
 }
 if(p.action==='settings'){
  const value=settingsSchema.parse(p);await db.prepare("INSERT INTO business_settings (id,value,updated_at) VALUES ('operations',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(value),now).run();return Response.json({ok:true});
 }
 if(p.action==='dispatch'){
  const replay=await commandReceipt(p);if(replay)return replay;
  if(!await db.prepare('SELECT id FROM crew WHERE id=? AND active=1').bind(p.crewId).first())return conflict('Choose an active crew member.');
  const all=await db.prepare("SELECT * FROM jobs WHERE status IN ('scheduled','in_progress')").all();const unique=[...new Set(p.jobs.map((j:any)=>j.id))];const selected=all.results.filter((j:any)=>unique.includes(j.id));
  if(selected.length!==unique.length||selected.some((j:any)=>j.version!==p.jobs.find((v:any)=>v.id===j.id)?.version))return conflict('A selected visit changed. Refresh the dispatch board.');
  const settings=await loadSettings();for(const day of new Set(selected.map((j:any)=>j.scheduled_date))){const n=all.results.filter((j:any)=>j.scheduled_date===day&&(j.crew_id===p.crewId||unique.includes(j.id))).length;if(n>settings.dailyCapacity)return conflict(`Assignment would exceed the daily capacity of ${settings.dailyCapacity} visits on ${day}. Adjust the selection or capacity in Settings.`);}
  await db.batch([commandStatement(p),...selected.flatMap((j:any)=>[db.prepare('UPDATE jobs SET crew_id=?,version=? WHERE id=?').bind(p.crewId,j.version+1,j.id),event(j.user_id,j.request_id,'crew_assigned','A team member has been assigned to your visit on '+j.scheduled_date+'.')])]);return Response.json({ok:true});
 }
 if(p.action==='payment'){
  const replay=await commandReceipt(p);if(replay)return replay;
  const i=await db.prepare('SELECT i.*,COALESCE((SELECT SUM(amount_cents) FROM payments WHERE invoice_id=i.id),0) AS paid_cents FROM invoices i WHERE id=?').bind(p.id).first();
  if(!i||i.status==='paid')return conflict('This invoice is not awaiting payment.');const balance=i.amount_cents+i.tax_cents-i.paid_cents,amount=p.amount===undefined?balance:Math.round(p.amount*100);
  if(amount<=0||amount>balance)return conflict('Enter a received amount greater than zero and no larger than the outstanding balance.');
  await db.batch([commandStatement(p),db.prepare('INSERT INTO payments (id,invoice_id,amount_cents,method,reference,received_at,recorded_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),i.id,amount,p.method,p.reference,p.receivedDate||now.slice(0,10),user.email,now),db.prepare("UPDATE invoices SET status=CASE WHEN (SELECT SUM(amount_cents) FROM payments WHERE invoice_id=?)>=amount_cents+tax_cents THEN 'paid' ELSE 'partial' END,reference=?,paid_at=CASE WHEN (SELECT SUM(amount_cents) FROM payments WHERE invoice_id=?)>=amount_cents+tax_cents THEN ? ELSE NULL END WHERE id=?").bind(i.id,p.reference,i.id,now,i.id),event(i.user_id,i.request_id,'payment_received',`Trios verified a payment of CAD ${(amount/100).toFixed(2)}. Your remaining invoice balance is shown in Billing.`)]);return Response.json({ok:true});
 }
 return null;
}
