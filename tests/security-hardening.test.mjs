import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trios-security-'));
const oldEnv={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,origin:process.env.SITE_ORIGIN,owners:process.env.OWNER_EMAILS};
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-test-key',SITE_ORIGIN:'https://test.trios',OWNER_EMAILS:'owner@example.com'});
const confirmed={id:'customer-1',email:'customer@example.com',email_confirmed_at:'2026-09-08T00:00:00Z',user_metadata:{role:'admin'}};
const calls={signOut:0,email:0,storage:0};
let authError=null,user=confirmed,row=null;
const authResult=()=>({data:{user,session:user?{access_token:'test'}:null},error:authError});
globalThis.__securityAuth={auth:{
 async getUser(){if(authError instanceof Error)throw authError;return authResult()},
 async signInWithOtp(){calls.email++;if(authError instanceof Error)throw authError;return {error:authError}},
 async verifyOtp(){if(authError instanceof Error)throw authError;return authResult()},
 async exchangeCodeForSession(){if(authError instanceof Error)throw authError;return authResult()},
 async signOut(){calls.signOut++;if(authError instanceof Error)throw authError;return {error:authError}}
}};
globalThis.__securityDB={prepare(query){return {bind(){return this},async first(){return query.startsWith('SELECT * FROM uploads')?row:query.startsWith('SELECT count(*)')?{n:0}:null},async run(){return {meta:{changes:1}}}}}};
globalThis.__securityBucket={async get(){calls.storage++;return {body:new Uint8Array([137,80,78,71,13,10,26,10])}},async put(){calls.storage++},async delete(){}};
const plugin={name:'security-fixtures',setup(b){
 b.onResolve({filter:/^(\.\/postgres-db|\.\/private-storage)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onResolve({filter:/^@supabase\/ssr$|^next\/headers$|^next\/server$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:
 a.path==='./postgres-db'?'export const database=globalThis.__securityDB':
 a.path==='./private-storage'?'export const privateStorage=globalThis.__securityBucket':
 a.path==='@supabase/ssr'?'export function createServerClient(){return globalThis.__securityAuth}':
 a.path==='next/headers'?'export async function cookies(){return {getAll:()=>[],set(){}}}':
 'export const NextResponse={redirect(url){return new Response(null,{status:307,headers:{Location:String(url)}})},next(){return new Response(null,{headers:{Vary:"RSC"}})}}'
 }));
}};
const exports=[
 "export {sameOrigin,fail,identity} from './lib/server'",
 "export {safeReturnPath} from './lib/auth-paths'",
 "export {boundedBody,boundedJson} from './lib/request-body'",
 "export {verifiedUser} from './lib/supabase/server'",
 "export {POST as emailPost} from './app/api/auth/email/route'",
 "export {POST as verifyPost} from './app/api/auth/verify/route'",
 "export {POST as signOutPost} from './app/api/auth/sign-out/route'",
 "export {GET as callbackGet} from './app/auth/callback/route'",
 "export {GET as fileGet} from './app/api/files/[id]/route'",
 "export {POST as uploadPost} from './app/api/upload/route'",
 "export {proxy} from './proxy'"
].join(';\n');
await build({stdin:{contents:exports,resolveDir:root,loader:'ts'},outfile:temp+'/security.mjs',bundle:true,platform:'node',format:'esm',plugins:[plugin],tsconfig:root+'/tsconfig.json'});
const api=await import(temp+'/security.mjs');
const request=(endpoint,body,headers={})=>new Request('https://test.trios'+endpoint,{method:'POST',headers:{Origin:'https://test.trios','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const privateResponse=response=>assert.equal(response.headers.get('cache-control'),'private, no-store');
after(()=>{
 fs.rmSync(temp,{recursive:true,force:true});
 for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:oldEnv.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:oldEnv.key,SITE_ORIGIN:oldEnv.origin,OWNER_EMAILS:oldEnv.owners})){if(value===undefined)delete process.env[key];else process.env[key]=value}
});

test('mutations require exact same-origin evidence, including legacy referrers',()=>{
 const req=headers=>new Request('https://test.trios/api/data',{method:'POST',headers});
 for(const headers of [{},{Origin:'null'},{Origin:'https://test.trios.attacker.test'},{Origin:'https://sibling.trios','sec-fetch-site':'same-site'},{'sec-fetch-site':'same-site'},{Origin:'https://test.trios','sec-fetch-site':'cross-site'},{Referer:'https://attacker.test/form'}])assert.equal(api.sameOrigin(req(headers)),false,JSON.stringify(headers));
 for(const headers of [{Origin:'https://test.trios'},{'sec-fetch-site':'same-origin'},{Referer:'https://test.trios/sign-out'}])assert.equal(api.sameOrigin(req(headers)),true,JSON.stringify(headers));
});

test('return paths reject external, encoded auth/API and control-character redirects',()=>{
 for(const value of ['https://attacker.test','//attacker.test','/\\attacker.test','/%2f%2fattacker.test','/%61uth/callback','/%2561pi/data','/foo/%2e%2e/api/data','/sign-in','/%0d%0aLocation:evil','/\n/attacker.test','/x'.repeat(1100)])assert.equal(api.safeReturnPath(value),'/portal',value);
 assert.equal(api.safeReturnPath('/portal?tab=visits#next'),'/portal?tab=visits#next');
 assert.equal(api.safeReturnPath('/services/snow%20clearing'),'/services/snow%20clearing');
});

test('bounded bodies reject malformed UTF-8 and streaming oversize without trusting Content-Length',async()=>{
 const bytes=new Uint8Array([123,34,120,34,58,34,255,34,125]);
 await assert.rejects(api.boundedJson(new Request('https://test.trios',{method:'POST',body:bytes})),error=>error.status===400);
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(20));controller.close()},cancel(){throw Error('upstream cancel detail')}});
 await assert.rejects(api.boundedBody(new Request('https://test.trios',{method:'POST',body:stream,duplex:'half',headers:{'Content-Length':'1'}}),10),error=>error.status===413);
});

test('auth validation and oversized payloads never invoke provider operations',async()=>{
 const before=calls.email;
 let result=await api.emailPost(request('/api/auth/email',{email:'not-valid'}));assert.equal(result.status,400);privateResponse(result);
 result=await api.emailPost(request('/api/auth/email','x'.repeat(4000)));assert.equal(result.status,413);privateResponse(result);
 result=await api.emailPost(request('/api/auth/email',{email:'person@example.com'},{Origin:'null'}));assert.equal(result.status,403);privateResponse(result);
 assert.equal(calls.email,before);
 const logoutCount=calls.signOut;
 result=await api.signOutPost(request('/api/auth/sign-out','x'.repeat(5000),{'Content-Type':'application/x-www-form-urlencoded'}));assert.equal(result.status,413);privateResponse(result);
 result=await api.signOutPost(request('/api/auth/sign-out','not a form'));assert.equal(result.status,400);privateResponse(result);
 assert.equal(calls.signOut,logoutCount);
 result=await api.signOutPost(request('/api/auth/sign-out','returnTo=%2F%2Fattacker.test',{'Content-Type':'application/x-www-form-urlencoded'}));assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/');privateResponse(result);
});

test('provider failures and unconfirmed/anonymous identities fail closed without exposing details',async()=>{
 authError=new Error('secret provider diagnostic');
 assert.equal(await api.verifiedUser(),null);
 for(const [handler,body] of [[api.emailPost,{email:'person@example.com'}],[api.verifyPost,{email:'person@example.com',code:'123456'}]]){
  const result=await handler(request('/api/auth/test',body));assert.equal(result.status,503);privateResponse(result);assert.ok(!(await result.text()).includes('secret'));
 }
 let callback=await api.callbackGet(new Request('https://test.trios/auth/callback?code=secret-code'));
 assert.equal(callback.headers.get('location'),'https://test.trios/sign-in?error=verification');privateResponse(callback);assert.equal(callback.headers.get('referrer-policy'),'no-referrer');
 const refreshed=await api.proxy(new Request('https://test.trios/portal'));assert.equal(refreshed.headers.get('cache-control'),'private, no-store, max-age=0');
 authError=null;
 for(const candidate of [{...confirmed,email_confirmed_at:null},{...confirmed,is_anonymous:true},{...confirmed,id:''}]){user=candidate;assert.equal(await api.verifiedUser(),null)}
 user=confirmed;assert.equal((await api.identity()).owner,false); // editable user_metadata.role is never authority
 callback=await api.callbackGet(new Request('https://test.trios/auth/callback?code=valid&return_to=%2Fportal'));
 assert.equal(callback.headers.get('location'),'https://test.trios/portal');privateResponse(callback);
});

test('private file failures cannot reveal existence, cache records or serve active MIME types',async()=>{
 user=confirmed;const id='ac8684d7-0148-4aa0-ad22-0e1b7649acac';
 const get=id=>api.fileGet(new Request('https://test.trios/api/files/'+id),{params:Promise.resolve({id})});
 const count=calls.storage;
 row={id,user_id:'another-customer',mime:'image/png'};
 let result=await get(id);assert.equal(result.status,404);privateResponse(result);assert.equal(calls.storage,count);
 row={id,user_id:confirmed.id,mime:'text/html'};
 result=await get(id);assert.equal(result.status,404);privateResponse(result);assert.equal(calls.storage,count);
 result=await get('------------------------------------');assert.equal(result.status,404);privateResponse(result);
 row={id,user_id:confirmed.id,mime:'image/png'};
 result=await get(id);assert.equal(result.status,200);privateResponse(result);assert.equal(result.headers.get('cross-origin-resource-policy'),'same-origin');assert.match(result.headers.get('content-security-policy'),/sandbox/);
 user=null;result=await get(id);assert.equal(result.status,401);privateResponse(result);user=confirmed;
});

test('upload signatures and all private error responses are checked before storage',async()=>{
 const before=calls.storage;
 const form=new FormData();form.set('file',new File([new Uint8Array([137,80,78,71,1,1,1,1,1,1,1,1])],'fake.png',{type:'image/png'}));
 const result=await api.uploadPost(new Request('https://test.trios/api/upload',{method:'POST',headers:{Origin:'https://test.trios'},body:form}));
 assert.equal(result.status,400);privateResponse(result);assert.equal(calls.storage,before);
 const failed=api.fail(new Error('password=private-secret'));assert.equal(failed.status,500);privateResponse(failed);assert.ok(!(await failed.text()).includes('private-secret'));
});
