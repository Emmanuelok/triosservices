import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trios-service-changes-'));
const pg=new PGlite();
for(const filename of ['001_trios.sql','002_service_changes.sql','003_moving.sql'])await pg.exec(fs.readFileSync(root+'/migrations/postgres/'+filename,'utf8'));
const envKeys=['DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','SITE_ORIGIN','OWNER_EMAILS'];
const oldEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
Object.assign(process.env,{DATABASE_URL:'postgres://local-test-only/secret',NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-publishable',SUPABASE_SERVICE_ROLE_KEY:'test-private-secret',SITE_ORIGIN:'https://test.trios',OWNER_EMAILS:'owner@example.com'});
let begins=0;const executed=[];
globalThis.__servicePostgres={async begin(work){begins++;return pg.transaction(async tx=>{
 const query=async strings=>{const sql=strings.join('');executed.push(sql);return tx.query(sql)};
 query.unsafe=async(sql,args)=>{executed.push(sql);const result=await tx.query(sql,args);return Object.assign(result.rows,{count:result.affectedRows||0})};
 return work(query);
})}};
const users={alice:{id:'alice',email:'alice@example.com',email_confirmed_at:'2026-09-08',user_metadata:{}},bob:{id:'bob',email:'bob@example.com',email_confirmed_at:'2026-09-08',user_metadata:{}},owner:{id:'owner',email:'owner@example.com',email_confirmed_at:'2026-09-08',user_metadata:{}}};
globalThis.__serviceUser=users.alice;
globalThis.__serviceStorageAvailable=true;
const plugin={name:'real-transaction-fixtures',setup(b){
 b.onResolve({filter:/^postgres$|^\.\/supabase\/server$|^\.\/private-storage$/},a=>({path:a.path,namespace:'service-fixture'}));
 b.onLoad({filter:/.*/,namespace:'service-fixture'},a=>({loader:'js',contents:a.path==='postgres'?'export default function postgres(){return globalThis.__servicePostgres}':a.path==='./private-storage'?'export const privateStorage={async available(){return globalThis.__serviceStorageAvailable}}':'export async function verifiedUser(){return globalThis.__serviceUser}'}));
}};
await build({stdin:{contents:"export {GET,POST} from './app/api/service-changes/route';export {GET as healthGET} from './app/api/health/route';export {readinessDetails} from './lib/readiness';export {database} from './lib/postgres-db';export {fail} from './lib/server';",resolveDir:root,loader:'ts'},outfile:temp+'/routes.mjs',bundle:true,platform:'node',format:'esm',plugins:[plugin],tsconfig:root+'/tsconfig.json'});
const api=await import(temp+'/routes.mjs');const db=api.database;
const now=new Date().toISOString();
const user=name=>globalThis.__serviceUser=name?users[name]:null;
const row=(table,id)=>db.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first();
async function fixture(owner='alice',options={}){
 const requestId=crypto.randomUUID(),jobId=crypto.randomUUID();
 await db.prepare('INSERT INTO requests(id,user_id,customer_name,email,phone,address,area,postal_code,services,frequency,details,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(requestId,owner,owner==='alice'?'Alice Customer':'Bob Private',owner+'@example.com','7090000000',owner==='alice'?'10 Alice Road':'99 Bob Secret Street','St. John’s','A1A 1A1','["snow"]','Seasonal','{}','accepted',now,now).run();
 await db.prepare('INSERT INTO jobs(id,request_id,user_id,service,scheduled_date,time_window,crew_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(jobId,requestId,owner,'snow',options.date||'2099-12-01','Morning',options.crewId||null,options.status||'scheduled',now).run();
 return {requestId,jobId};
}
function change(jobId,kind='reschedule',overrides={}){return {action:'create',id:crypto.randomUUID(),jobId,kind,message:'Please adjust my scheduled service.',requestedDate:kind==='reschedule'?'2099-12-02':'',requestedWindow:kind==='reschedule'?'Afternoon':'',...overrides}}
async function post(command,expected=200){
 const response=await api.POST(new Request('https://test.trios/api/service-changes',{method:'POST',headers:{Origin:'https://test.trios','Content-Type':'application/json'},body:JSON.stringify(command)}));
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));assert.equal(response.headers.get('cache-control'),'private, no-store');return result;
}
async function get(mode='',expected=200){const response=await api.GET(new Request('https://test.trios/api/service-changes'+(mode?'?mode='+mode:'')));const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));assert.equal(response.headers.get('cache-control'),'private, no-store');return result}
after(async()=>{await pg.close();fs.rmSync(temp,{recursive:true,force:true});for(const [key,value] of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value}});

test('transaction callback uses one real transaction and rolls back all writes on failure',async()=>{
 const prior=begins;
 await assert.rejects(db.transaction(async tx=>{await tx.prepare('INSERT INTO planner_usage(id,count) VALUES (?,?)').bind('atomic-test',1).run();assert.equal((await tx.prepare('SELECT count FROM planner_usage WHERE id=?').bind('atomic-test').first()).count,1);throw new Error('Abort transaction')}),/Abort transaction/);
 assert.equal(begins,prior+1);assert.equal(await row('planner_usage','atomic-test'),null);assert.ok(executed.some(sql=>sql.includes("pg_advisory_xact_lock(hashtext('trios-write'))")));
});

test('creation enforces visit ownership, exact retries and one open request per kind',async()=>{
 const visit=await fixture();user('bob');await post(change(visit.jobId),404);
 user('alice');const command=change(visit.jobId);const result=await post(command);assert.equal(result.id,command.id);
 const replay=await post(command);assert.equal(replay.replayed,true);
 await post({...command,message:'Different text using the same identifier.'},409);
 await post(change(visit.jobId),409);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM service_changes WHERE job_id=?').bind(visit.jobId).first()).n,1);
 assert.equal((await db.prepare("SELECT count(*) AS n FROM events WHERE request_id=? AND kind='change_requested'").bind(visit.requestId).first()).n,1);
 user('bob');await post(command,409);
});

test('customers cannot resolve requests or withdraw another customer’s request',async()=>{
 user('alice');const visit=await fixture(),command=change(visit.jobId,'access');await post(command);
 await post({action:'resolve',id:command.id,version:0,decision:'approved',resolution:'This attempt must be rejected.'},403);
 user('bob');await post({action:'withdraw',id:command.id,version:0},404);
 user('alice');await post({action:'withdraw',id:command.id,version:0});assert.equal((await row('service_changes',command.id)).status,'withdrawn');assert.equal((await row('jobs',visit.jobId)).version,0);
 await post({action:'withdraw',id:command.id,version:0},409);
 // A withdrawn request releases the unique open slot.
 await post(change(visit.jobId,'access'));
});

test('admin approval atomically reschedules the visit and records the customer decision',async()=>{
 user('alice');const visit=await fixture(),command=change(visit.jobId);await post(command);
 user('owner');const start=begins;
 await post({action:'resolve',id:command.id,version:0,decision:'approved',resolution:'Your requested afternoon visit is confirmed.',jobVersion:0});
 assert.equal(begins,start+1);
 const job=await row('jobs',visit.jobId),item=await row('service_changes',command.id);
 assert.equal(job.scheduled_date,'2099-12-02');assert.equal(job.time_window,'Afternoon');assert.equal(job.version,1);
 assert.equal(item.status,'approved');assert.equal(item.version,1);assert.equal(item.resolved_by,'owner@example.com');
 assert.equal((await db.prepare("SELECT count(*) AS n FROM events WHERE request_id=? AND kind='change_approved'").bind(visit.requestId).first()).n,1);
});

test('admin cancellation closes only the visit and preserves invoice balances',async()=>{
 user('alice');const visit=await fixture(),command=change(visit.jobId,'cancellation');await post(command);
 const invoiceId=crypto.randomUUID();await db.prepare('INSERT INTO invoices(id,request_id,user_id,description,amount_cents,due_date,created_at) VALUES (?,?,?,?,?,?,?)').bind(invoiceId,visit.requestId,'alice','Agreed seasonal care',59900,'2099-12-01',now).run();
 user('owner');await post({action:'resolve',id:command.id,version:0,decision:'approved',resolution:'This visit can be cancelled as requested.',jobVersion:0});
 const job=await row('jobs',visit.jobId);assert.equal(job.status,'cancelled');assert.equal(job.version,1);assert.match(job.notes,/Cancellation approved/);
 assert.equal((await row('service_changes',command.id)).status,'approved');assert.equal((await row('invoices',invoiceId)).status,'open');assert.equal((await row('invoices',invoiceId)).amount_cents,59900);
});

test('stale ticket and visit versions reject decisions without losing pending requests',async()=>{
 user('alice');const visit=await fixture(),command=change(visit.jobId);await post(command);user('owner');
 const resolution={action:'resolve',id:command.id,version:0,decision:'approved',resolution:'Approve only the current job version.',jobVersion:0};
 await post({...resolution,version:1},409);
 await db.prepare('UPDATE jobs SET notes=?,version=? WHERE id=?').bind('An updated crew note.',1,visit.jobId).run();
 await post(resolution,409);const item=await row('service_changes',command.id),job=await row('jobs',visit.jobId);assert.equal(item.status,'open');assert.equal(item.version,0);assert.equal(job.scheduled_date,'2099-12-01');assert.equal(job.version,1);
 await post({...resolution,jobVersion:1});await post({...resolution,jobVersion:2},409);
});

test('capacity rejection rolls back the visit, pending ticket and approval event together',async()=>{
 const crewId=crypto.randomUUID();await db.prepare('INSERT INTO crew(id,name,email,created_at) VALUES (?,?,?,?)').bind(crewId,'Capacity Crew',crewId+'@example.com',now).run();
 await db.prepare('INSERT INTO business_settings(id,value,updated_at) VALUES (?,?,?)').bind('operations','{"dailyCapacity":1}',now).run();
 const visit=await fixture('alice',{crewId}),occupied=await fixture('bob',{crewId,date:'2099-12-02'});
 user('alice');const command=change(visit.jobId);await post(command);user('owner');
 await post({action:'resolve',id:command.id,version:0,decision:'approved',resolution:'This must respect existing crew capacity.',jobVersion:0},409);
 const job=await row('jobs',visit.jobId),item=await row('service_changes',command.id);assert.equal(job.scheduled_date,'2099-12-01');assert.equal(job.version,0);assert.equal(item.status,'open');assert.equal(item.version,0);
 assert.equal((await db.prepare("SELECT count(*) AS n FROM events WHERE request_id=? AND kind='change_approved'").bind(visit.requestId).first()).n,0);
 assert.equal((await row('jobs',occupied.jobId)).scheduled_date,'2099-12-02');
});

test('closed visits allow concerns but reject scheduling changes, with atomic admin declines',async()=>{
 user('alice');const visit=await fixture('alice',{status:'completed'});await post(change(visit.jobId),409);
 const command=change(visit.jobId,'quality');await post(command);user('owner');await post({action:'resolve',id:command.id,version:0,decision:'declined',resolution:'We reviewed the photos and will contact you.'});
 assert.equal((await row('jobs',visit.jobId)).status,'completed');assert.equal((await row('service_changes',command.id)).status,'declined');
});

test('GET requires identity and separates customer records from administrator review',async()=>{
 user('bob');const visit=await fixture('bob'),command=change(visit.jobId,'quality');await post(command);
 user(null);await get('',401);user('alice');await get('admin',403);
 const customer=await get();assert.ok(customer.items.length>0);assert.ok(customer.items.every(item=>item.customer_name==='Alice Customer'));assert.ok(!JSON.stringify(customer).includes('99 Bob Secret Street'));
 for(const item of customer.items){assert.ok(!('fingerprint' in item));assert.ok(!('resolved_by' in item));assert.ok(!('user_id' in item))}
 user('owner');assert.equal((await get()).items.length,0);const business=await get('admin');assert.ok(business.items.some(item=>item.id===command.id));
});

test('upload quota is enforced by PostgreSQL and rolls back an over-limit insert',async()=>{
 await db.transaction(async tx=>{for(let i=0;i<200;i++)await tx.prepare('INSERT INTO uploads(id,user_id,name,mime,created_at) VALUES (?,?,?,?,?)').bind('quota-'+i,'quota-owner','photo.png','image/png',now).run()});
 await assert.rejects(db.prepare('INSERT INTO uploads(id,user_id,name,mime,created_at) VALUES (?,?,?,?,?)').bind('quota-overflow','quota-owner','photo.png','image/png',now).run(),/upload_quota/);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM uploads WHERE user_id=?').bind('quota-owner').first()).n,200);assert.equal(await row('uploads','quota-overflow'),null);
});

test('public readiness fails closed on missing configuration and omits connection secrets',async()=>{
 delete process.env.DATABASE_URL;
 let response=await api.healthGET(),health=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(health.status,'setup_required');assert.equal(health.bookingAvailable,false);assert.equal(health.accountsAvailable,false);assert.equal(health.photosAvailable,false);
 assert.deepEqual(Object.keys(health).sort(),['accountsAvailable','bookingAvailable','checkedAt','photosAvailable','status']);assert.ok(!JSON.stringify(health).includes('secret'));
 process.env.DATABASE_URL='postgres://local-test-only/secret';delete process.env.OWNER_EMAILS;
 health=await (await api.healthGET()).json();assert.equal(health.bookingAvailable,false);assert.equal(health.accountsAvailable,false);
 process.env.OWNER_EMAILS='not-an-email';health=await (await api.healthGET()).json();assert.equal(health.status,'setup_required');assert.equal(health.bookingAvailable,false);
 process.env.OWNER_EMAILS='owner@example.com';delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;health=await (await api.healthGET()).json();assert.equal(health.bookingAvailable,false);
});

test('public readiness stays unavailable on database failures and incomplete migrations',async()=>{
 Object.assign(process.env,{DATABASE_URL:'postgres://local-test-only/secret',NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-publishable',SITE_ORIGIN:'https://test.trios',OWNER_EMAILS:'owner@example.com'});
 const originalBegin=globalThis.__servicePostgres.begin;
 try{
  globalThis.__servicePostgres.begin=async()=>{throw new Error('Database connection failed with private credentials')};
  const isolated=await import(temp+'/routes.mjs?probe=unavailable');
  const response=await isolated.healthGET(),health=await response.json();assert.equal(health.status,'unavailable');assert.equal(health.bookingAvailable,false);assert.equal(health.accountsAvailable,false);assert.equal(health.photosAvailable,false);assert.ok(!JSON.stringify(health).includes('credentials'));
 }finally{globalThis.__servicePostgres.begin=originalBegin}
 await pg.exec('ALTER TABLE trios.service_changes RENAME TO service_changes_probe');
 try{
  const isolated=await import(temp+'/routes.mjs?probe=missing-schema');
  const health=await (await isolated.healthGET()).json();assert.equal(health.status,'setup_required');assert.equal(health.bookingAvailable,false);assert.equal(health.accountsAvailable,false);
 }finally{await pg.exec('ALTER TABLE trios.service_changes_probe RENAME TO service_changes')}
});

test('access approval preserves existing notes on stale jobs and updates instructions atomically',async()=>{
 user('alice');const visit=await fixture(),command=change(visit.jobId,'access',{message:'Use the side gate. Please close the latch after service.'});
 await db.prepare('UPDATE jobs SET access_notes=? WHERE id=?').bind('Use the front entrance.',visit.jobId).run();
 await post(command);
 assert.equal((await row('jobs',visit.jobId)).access_notes,'Use the front entrance.');
 assert.equal((await get()).items.find(item=>item.id===command.id).message,command.message);
 user('owner');const decision={action:'resolve',id:command.id,version:0,decision:'approved',resolution:'Updated access instructions are confirmed.',jobVersion:0};
 await db.prepare('UPDATE jobs SET notes=?,version=? WHERE id=?').bind('Crew assignment reviewed.',1,visit.jobId).run();
 await post(decision,409);
 assert.equal((await row('jobs',visit.jobId)).access_notes,'Use the front entrance.');assert.equal((await row('service_changes',command.id)).status,'open');
 const prior=begins;await post({...decision,jobVersion:1});assert.equal(begins,prior+1);
 const job=await row('jobs',visit.jobId),item=await row('service_changes',command.id);
 assert.equal(job.access_notes,command.message);assert.equal(job.version,2);assert.equal(job.scheduled_date,'2099-12-01');assert.equal(job.status,'scheduled');assert.equal(job.notes,'Crew assignment reviewed.');assert.equal(item.status,'approved');assert.equal(item.version,1);
});

test('service-change mutations reject missing identity and foreign or absent origin evidence',async()=>{
 const command=change(crypto.randomUUID());user(null);const before=begins;await post(command,401);assert.equal(begins,before);
 user('alice');for(const origin of ['https://attacker.test','null',undefined]){
  const headers={'Content-Type':'application/json'};if(origin!==undefined)headers.Origin=origin;
  const response=await api.POST(new Request('https://test.trios/api/service-changes',{method:'POST',headers,body:JSON.stringify(command)}));assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
 assert.equal(begins,before);
});

test('health rejects malformed origin configuration and gates photos on reachable private storage',async()=>{
 const valid={SITE_ORIGIN:'https://test.trios',NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-publishable',OWNER_EMAILS:'owner@example.com',DATABASE_URL:'postgres://local-test-only/secret',SUPABASE_SERVICE_ROLE_KEY:'test-private-secret'};
 for(const key of ['SITE_ORIGIN','NEXT_PUBLIC_SUPABASE_URL'])for(const invalid of ['not-a-url','https://name:password@example.com','https://test.trios/path','https://test.trios?token=secret','https://test.trios#fragment','javascript:alert(1)']){
  Object.assign(process.env,valid,{[key]:invalid});const health=await (await api.healthGET()).json();assert.equal(health.status,'setup_required',key+' '+invalid);assert.equal(health.bookingAvailable,false);assert.equal(health.accountsAvailable,false);assert.equal(health.photosAvailable,false);
 }
 Object.assign(process.env,valid);globalThis.__serviceStorageAvailable=false;
 let health=await (await api.healthGET()).json();assert.equal(health.status,'ready');assert.equal(health.bookingAvailable,true);assert.equal(health.photosAvailable,false);
 globalThis.__serviceStorageAvailable=true;health=await (await api.healthGET()).json();assert.equal(health.photosAvailable,true);
 const quota=api.fail(new Error('upload_quota'));assert.equal(quota.status,429);assert.equal(quota.headers.get('cache-control'),'private, no-store');assert.match((await quota.json()).error,/photo limit/i);
});
