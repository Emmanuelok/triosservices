import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trios-access-'));
const crew=new Map([['crew@example.com',true],['inactive@example.com',false]]);
globalThis.__env={OWNER_EMAILS:' OWNER@example.com ',DB:{prepare(){return {bind(email){return {async first(){return crew.get(email)?{id:'crew-1'}:null}}}}}}};
globalThis.__headers=new Headers();process.env.OWNER_EMAILS='owner@example.com';process.env.SITE_ORIGIN='https://test.trios';
const stub={name:'page-platform-stubs',setup(b){
 b.onResolve({filter:/^(\.\/postgres-db|\.\/private-storage|\.\/supabase\/server|@\/lib\/supabase\/server)$/},a=>({path:a.path,namespace:'server-mock'}));
 b.onLoad({filter:/.*/,namespace:'server-mock'},a=>({contents:a.path.includes('postgres-db')?'export const database=globalThis.__env.DB':a.path.includes('private-storage')?'export const privateStorage=globalThis.__env.BUCKET':`export async function verifiedUser(){const h=globalThis.__headers;const id=h.get('oai-authenticated-user-id'),email=h.get('oai-authenticated-user-email');return id&&email?{id,email,email_confirmed_at:'verified',user_metadata:{full_name:h.get('oai-authenticated-user-full-name')||email}}:null} export function authConfigured(){return true}`,loader:'js'}));

 b.onResolve({filter:/^cloudflare:workers$|^next\/headers$|^next\/navigation$|^@\/components\/(operations|site-app|staff-shell)$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='cloudflare:workers'?'export const env=globalThis.__env':a.path==='next/headers'?'export async function headers(){return globalThis.__headers}':a.path==='next/navigation'?'export function redirect(location){throw Object.assign(new Error("redirect"),{location})}':'export function Operations(){};export function StaffShell(){};export function SiteApp(){}',loader:'js'}));
}};
await build({entryPoints:['app/operations/page.tsx','app/crew/page.tsx','app/portal/page.tsx','app/staff/page.tsx','app/staff/sign-in/page.tsx','app/chatgpt-auth.ts'].map(p=>root+'/'+p),outdir:temp,outbase:root+'/app',bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[stub],tsconfig:root+'/tsconfig.json'});
const pages=Object.fromEntries(await Promise.all(['operations','crew','portal','staff','staff/sign-in'].map(async p=>[p,await import(temp+'/'+p+'/page.mjs')])));
const auth=await import(temp+'/chatgpt-auth.mjs');
function user(email,id=email){globalThis.__headers=new Headers(email?{'oai-authenticated-user-email':email,...(id?{'oai-authenticated-user-id':id}:{})}:{})}
async function denied(page,to){await assert.rejects(pages[page].default(),e=>e.location===to)}
async function allowed(page,workspace){const result=await pages[page].default();assert.ok(result);if(workspace)assert.equal(result.props.workspace,workspace);return result}
user(null);await denied('operations','/staff/sign-in');await denied('crew','/staff/sign-in');await denied('staff','/staff/sign-in');await denied('portal','/sign-in?return_to=%2Fportal');
user('owner@example.com',null);await denied('operations','/staff/sign-in');await denied('portal','/sign-in?return_to=%2Fportal');
console.log('PASS anonymous and partial identities cannot render protected pages');
user('customer@example.com');await denied('operations','/staff/sign-in');await denied('crew','/staff/sign-in');await denied('staff','/staff/sign-in');await allowed('portal');
console.log('PASS customers can render only their customer portal, not either staff panel');
user('crew@example.com');await denied('operations','/crew');await allowed('crew','crew');await denied('staff','/crew');crew.set('crew@example.com',false);await denied('crew','/staff/sign-in');crew.set('crew@example.com',true);
user('inactive@example.com');await denied('operations','/staff/sign-in');await denied('crew','/staff/sign-in');
console.log('PASS active crew get crew access only; revocation applies on the next request');
user('owner@example.com');await allowed('operations','admin');await allowed('crew','crew');await denied('staff','/operations');
console.log('PASS configured administrators reach the admin workspace');
function links(node,out=[]){if(!node||typeof node!=='object')return out;if(node.props?.href)out.push(node.props.href);const children=node.props?.children;for(const child of Array.isArray(children)?children:[children]){if(Array.isArray(child))child.forEach(c=>links(c,out));else links(child,out)}return out}
user(null);assert.ok(links(await allowed('staff/sign-in')).includes('/sign-in?return_to=%2Fstaff'));
user('customer@example.com');const customerLinks=links(await allowed('staff/sign-in'));assert.ok(!customerLinks.includes('/staff'));assert.ok(!customerLinks.includes('/operations'));assert.ok(!customerLinks.includes('/crew'));assert.ok(customerLinks.includes('/sign-out?return_to=%2Fstaff%2Fsign-in'));
assert.equal(auth.chatGPTSignInPath('https://evil.example'),'/sign-in?return_to=%2Fportal');
assert.equal(auth.chatGPTSignInPath('//evil.example'),'/sign-in?return_to=%2Fportal');
console.log('PASS staff sign-in cannot grant a role or redirect outside the site');
// Verify the native Vercel proxy policy used by the migrated application.
const proxyStub={name:'native-next-proxy',setup(b){b.onResolve({filter:/^next\/server$|^@supabase\/ssr$/},a=>({path:a.path,namespace:'proxy-mock'}));b.onLoad({filter:/.*/,namespace:'proxy-mock'},a=>({contents:a.path==='next/server'?'export const NextResponse={next(){return new Response("page",{headers:{Vary:"RSC"}})}}':'export function createServerClient(){throw Error("Unexpected auth call")}',loader:'js'}))}};
await build({entryPoints:[root+'/proxy.ts'],outfile:temp+'/proxy.mjs',bundle:true,format:'esm',platform:'node',plugins:[proxyStub]});
const {proxy,config}=await import(temp+'/proxy.mjs');
for(const route of ['/operations','/crew','/portal','/staff','/staff/sign-in','/operations?_rsc=abc','/api/data?mode=admin']){const r=await proxy(new Request('https://test.trios'+route));assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(r.headers.get('vary'),'RSC')}
for(const route of ['operations','crew','portal','staff','api'])assert.ok(config.matcher.includes('/'+route+'/:path*'));
console.log('PASS Vercel private pages, RSC and APIs cannot be cached as public responses');
fs.rmSync(temp,{recursive:true,force:true});
