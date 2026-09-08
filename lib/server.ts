import { BodyError } from './request-body';
import { database } from './postgres-db';
import { privateStorage } from './private-storage';
import { verifiedUser } from './supabase/server';
export function runtime(){return {DB:database,BUCKET:privateStorage,OWNER_EMAILS:process.env.OWNER_EMAILS,SITE_ORIGIN:process.env.SITE_ORIGIN,OPENAI_API_KEY:process.env.OPENAI_API_KEY}}
export function sql(){return database}
export async function identity(){
 const user=await verifiedUser();if(!user)return null;
 const email=user.email!;
 const owner=(process.env.OWNER_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
 return {id:user.id,email,name:String(user.user_metadata?.full_name||email),owner};
}
export function sameOrigin(req:Request){
 const fetchSite=req.headers.get('sec-fetch-site');
 if(fetchSite==='cross-site')return false;
 const allowed=new Set([new URL(req.url).origin]);
 try{if(process.env.SITE_ORIGIN)allowed.add(new URL(process.env.SITE_ORIGIN).origin)}catch{/* A malformed optional origin must not expand access. */}
 const origin=req.headers.get('origin');
 // "null" origins and same-site sibling domains are not the same origin.
 if(origin)return allowed.has(origin);
 const referer=req.headers.get('referer');
 if(referer){try{return allowed.has(new URL(referer).origin)}catch{return false}}
 // Modern same-origin browser requests carry Fetch Metadata. Legacy requests
 // must supply Origin or Referer; absence of all evidence is not authorization.
 return fetchSite==='same-origin';
}
export function fail(error:unknown){if(error instanceof BodyError)return Response.json({error:error.message},{status:error.status,headers:noCache});const message=String(error);if(message.includes('upload_quota'))return Response.json({error:'Your photo limit has been reached. Please contact Trios.'},{status:429,headers:noCache});for(const [key,description] of Object.entries({duplicate_visit:'A visit for this property, service, date and window already exists. Use a different window for an intentional return visit.',stale_visit:'This visit changed. Refresh your records and try again.',closed_visit:'Completed and cancelled visits cannot be reopened.',crew_capacity:'This assignment exceeds the configured daily crew capacity. Adjust the schedule or operating settings.',payment_exceeds_balance:'The invoice balance changed. Refresh before recording this payment.',stale_approval:'The quote changed. Refresh before recording approval.'})){if(message.includes(key))return Response.json({error:description},{status:409,headers:noCache})}if(message.includes('UNIQUE constraint failed')||(error as any)?.code==='23505')return Response.json({error:'This record was already saved or changed. Refresh to see the current result.'},{status:409,headers:noCache});console.error('Trios request failed',{code:(error as any)?.code||'request_error'});return Response.json({error:'We could not complete that request. Your form details are still here; please try again.'},{status:500,headers:noCache})}
export function event(userId:string,requestId:string,kind:string,body:string){return sql().prepare('INSERT INTO events (id,user_id,request_id,kind,body,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,requestId,kind,body,new Date().toISOString())}
export const noCache={'Cache-Control':'private, no-store'};
