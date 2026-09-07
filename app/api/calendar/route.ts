import { linkCustomer } from '@/lib/operations-server';
import { identity,sql,noCache,fail } from '@/lib/server';
import { SERVICES } from '@/lib/catalog';
const escape=(value:unknown)=>String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,'\\$&');
function fold(line:string){const parts=[];let chunk='',bytes=0;for(const char of line){const n=new TextEncoder().encode(char).length;if(bytes+n>73){parts.push(chunk);chunk=' ';bytes=1}chunk+=char;bytes+=n}parts.push(chunk);return parts.join('\r\n')}
export async function GET(req:Request){try{
 const user=await identity();if(!user)return new Response('Sign in required',{status:401,headers:noCache});if(!user.owner)await linkCustomer(user);const mode=new URL(req.url).searchParams.get('mode');let where='j.user_id=?',bindings=[user.id];
 if(mode==='admin'){if(!user.owner)return new Response('Owner access required',{status:403,headers:noCache});where='1=1';bindings=[]}
 if(mode==='crew'){const c=await sql().prepare('SELECT id FROM crew WHERE lower(email)=? AND active=1').bind(user.email.toLowerCase()).first();if(!c&&!user.owner)return new Response('Crew access required',{status:403,headers:noCache});where=user.owner?'1=1':'j.crew_id=?';bindings=user.owner?[]:[c.id]}
 const {results}=await sql().prepare(`SELECT j.*,r.address,r.area FROM jobs j JOIN requests r ON r.id=j.request_id WHERE ${where} AND j.status!='cancelled' ORDER BY j.scheduled_date LIMIT 1000`).bind(...bindings).all();
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Trios//Property Care//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Trios service visits'];
 for(const j of results){const end=new Date(j.scheduled_date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push('BEGIN:VEVENT','UID:'+j.id+'@trios','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+j.scheduled_date.replaceAll('-',''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replaceAll('-',''),'SUMMARY:'+escape(SERVICES.find(s=>s.id===j.service)?.name||j.service),'LOCATION:'+escape(j.address+', '+j.area),'DESCRIPTION:'+escape('Agreed window: '+j.time_window+' (St. John’s time).\nStatus: '+j.status+'\n'+j.notes),'TRANSP:TRANSPARENT','END:VEVENT')}
 lines.push('END:VCALENDAR');return new Response(lines.map(fold).join('\r\n')+'\r\n',{headers:{...noCache,'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="Trios-Service-Visits.ics"'}});
 }catch(error){return fail(error)}}
