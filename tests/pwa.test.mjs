import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

async function importBundled(entry){
 const result=await build({entryPoints:[path.join(root,entry)],bundle:true,platform:'node',format:'esm',write:false,tsconfig:path.join(root,'tsconfig.json')});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
}

function pngDimensions(file){
 const bytes=fs.readFileSync(file);
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],path.basename(file)+' must be a PNG');
 assert.equal(bytes.subarray(12,16).toString('ascii'),'IHDR',path.basename(file)+' must include an IHDR chunk');
 return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
}

const manifestModule=await importBundled('app/manifest.ts');
const pwaManifest=manifestModule.default();
const configModule=await importBundled('next.config.ts');

test('manifest has stable handheld install identity and correctly sized icons',()=>{
 assert.equal(pwaManifest.id,'/');
 assert.equal(pwaManifest.start_url,'/');
 assert.equal(pwaManifest.scope,'/');
 assert.equal(pwaManifest.display,'standalone');
 assert.equal(pwaManifest.orientation,'any');
 assert.equal(pwaManifest.lang,'en-CA');
 assert.equal(pwaManifest.prefer_related_applications,false);
 assert.ok(pwaManifest.name&&pwaManifest.short_name&&pwaManifest.description);
 assert.equal(pwaManifest.theme_color,'#1b5256');
 assert.equal(pwaManifest.background_color,'#f8faf9');

 const expected=new Map([['192x192',[192,192]],['512x512',[512,512]]]);
 for(const icon of pwaManifest.icons){
  assert.equal(icon.type,'image/png');
  const declared=expected.get(icon.sizes);
  assert.ok(declared,'unexpected icon size '+icon.sizes);
  const file=path.join(root,'public',icon.src.replace(/^\//,''));
  assert.ok(fs.existsSync(file),icon.src+' must exist');
  assert.deepEqual(pngDimensions(file),declared,icon.src+' dimensions must match its manifest declaration');
 }
 assert.ok(pwaManifest.icons.some(icon=>icon.sizes==='192x192'&&icon.purpose==='any'));
 assert.ok(pwaManifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='any'));
 assert.ok(pwaManifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
 assert.deepEqual(pngDimensions(path.join(root,'public/pwa/apple-touch-icon-180.png')),[180,180]);
});

test('layout and hosting configuration expose PWA metadata and an update-safe worker',async()=>{
 const layout=fs.readFileSync(path.join(root,'app/layout.tsx'),'utf8');
 const registrar=fs.readFileSync(path.join(root,'components/pwa-install.tsx'),'utf8');
 assert.match(layout,/manifest:\s*["']\/manifest\.webmanifest["']/);
 assert.match(layout,/appleWebApp:/);
 assert.match(layout,/apple-touch-icon-180\.png/);
 assert.match(layout,/themeColor:\s*["']#1b5256["']/);
 assert.match(registrar,/serviceWorker\s*\.register\(["']\/sw\.js["'],\s*\{\s*scope:\s*["']\/["'],\s*updateViaCache:\s*["']none["']/s);

 const rules=await configModule.default.headers();
 const worker=rules.find(rule=>rule.source==='/sw.js');
 assert.ok(worker,'next.config must define service-worker headers');
 const headers=Object.fromEntries(worker.headers.map(header=>[header.key.toLowerCase(),header.value]));
 assert.match(headers['content-type'],/application\/javascript/);
 assert.match(headers['cache-control'],/no-cache/);
 assert.match(headers['cache-control'],/no-store/);
 assert.equal(headers['service-worker-allowed'],'/');
 for(const route of ['operations','crew','portal','staff','sign-in','sign-out','auth','api']){
  const rule=rules.find(candidate=>candidate.source==='/'+route+'/:path*');
  assert.ok(rule,'missing private header rule for '+route);
  assert.match(rule.headers.find(header=>header.key==='Cache-Control').value,/private, no-store/);
 }

 const cloudflareWorker=fs.readFileSync(path.join(root,'worker/index.ts'),'utf8');
 assert.match(cloudflareWorker,/sign-in\|sign-out\|auth\|api/);
 assert.match(cloudflareWorker,/url\.pathname === '\/sw\.js'/);
});

function createWorkerHarness(){
 const listeners={};
 const putCalls=[];
 const addAllCalls=[];
 const stored=new Map();
 let fetchImplementation=async()=>new Response('network',{status:200,headers:{'Content-Type':'text/plain'}});
 const keyFor=input=>typeof input==='string'?new URL(input,'https://trios.test').pathname:input.url;
 const cache={
  async addAll(urls){addAllCalls.push(...urls)},
  async put(request,response){putCalls.push(keyFor(request));stored.set(keyFor(request),response)},
 };
 const caches={
  async open(){return cache},
  async match(request){const value=stored.get(keyFor(request));return value?.clone?value.clone():value},
  async keys(){return []},
  async delete(){return true},
 };
 const self={
  location:{origin:'https://trios.test'},
  clients:{async claim(){}},
  async skipWaiting(){},
  addEventListener(type,listener){listeners[type]=listener},
 };
 const source=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
 vm.runInNewContext(source,{self,caches,fetch:(request)=>fetchImplementation(request),URL,Response,Promise,decodeURIComponent},{filename:'sw.js'});
 const request=(pathname,{method='GET',mode='cors',headers={}}={})=>({url:new URL(pathname,'https://trios.test').href,method,mode,headers:new Headers(headers)});
 const dispatchFetch=(candidate)=>{
  let response;
  listeners.fetch({request:candidate,respondWith(value){response=Promise.resolve(value)}});
  return response;
 };
 return {listeners,putCalls,addAllCalls,stored,request,dispatchFetch,setFetch(fn){fetchImplementation=fn}};
}

test('service worker precaches only the public offline shell and brand assets',async()=>{
 const harness=createWorkerHarness();
 let completed;
 harness.listeners.install({waitUntil(value){completed=Promise.resolve(value)}});
 await completed;
 assert.ok(harness.addAllCalls.includes('/offline.html'));
 assert.ok(harness.addAllCalls.includes('/pwa/icon-512.png'));
 assert.ok(harness.addAllCalls.includes('/brand/trios-logo.png'));
 assert.ok(!harness.addAllCalls.some(url=>/portal|operations|crew|staff|api|\.mp4/i.test(url)));
});

test('service worker leaves private, authenticated, RSC, media and cross-origin traffic network-only',()=>{
 const harness=createWorkerHarness();
 const privatePaths=['/portal','/portal/','/operations?tab=today','/crew/jobs','/staff','/sign-in','/sign-out','/auth/callback','/api/data','/%61pi/data'];
 for(const pathname of privatePaths)assert.equal(harness.dispatchFetch(harness.request(pathname,{mode:'navigate'})),undefined,pathname);
 const bypass=[
  harness.request('/services',{method:'POST'}),
  harness.request('/services',{headers:{Authorization:'Bearer private'}}),
  harness.request('/services',{headers:{Cookie:'session=private'}}),
  harness.request('/films/trios-seasons-v1.mp4',{headers:{Range:'bytes=0-99'}}),
  harness.request('/services?_rsc=abc'),
  harness.request('/services',{headers:{RSC:'1'}}),
  harness.request('/services',{headers:{'Next-Router-State-Tree':'private'}}),
  harness.request('/services',{headers:{'Next-Router-Prefetch':'1'}}),
  harness.request('/services',{headers:{Accept:'text/x-component'}}),
  harness.request('/_next/image?url=%2Fsummer-lawn.webp'),
  {url:'https://cdn.example.test/icon.png',method:'GET',mode:'cors',headers:new Headers()},
 ];
 for(const candidate of bypass)assert.equal(harness.dispatchFetch(candidate),undefined,candidate.url);
 assert.deepEqual(harness.putCalls,[]);
});

test('public navigation gets a generic offline fallback without caching HTML',async()=>{
 const harness=createWorkerHarness();
 harness.stored.set('/offline.html',new Response('<h1>You’re offline.</h1>',{headers:{'Content-Type':'text/html'}}));
 harness.setFetch(async()=>{throw new TypeError('offline')});
 const response=await harness.dispatchFetch(harness.request('/services',{mode:'navigate'}));
 assert.equal(response.status,200);
 assert.match(await response.text(),/offline/i);
 assert.deepEqual(harness.putCalls,[]);
});

test('service worker caches only approved public assets with public responses',async()=>{
 const harness=createWorkerHarness();
 harness.setFetch(async()=>new Response('icon',{status:200,headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'}}));
 await harness.dispatchFetch(harness.request('/pwa/icon-192.png'));
 assert.deepEqual(harness.putCalls,['https://trios.test/pwa/icon-192.png']);

 for(const headers of [
  {'Cache-Control':'private, no-store','Content-Type':'image/png'},
  {'Cache-Control':'no-cache','Content-Type':'image/png'},
  {'Set-Cookie':'session=secret','Content-Type':'image/png'},
  {'Content-Type':'text/x-component'},
 ]){
  harness.putCalls.length=0;
  harness.stored.clear();
  harness.setFetch(async()=>new Response('blocked',{status:200,headers}));
  await harness.dispatchFetch(harness.request('/pwa/icon-512.png'));
  assert.deepEqual(harness.putCalls,[],JSON.stringify(headers));
 }
});

test('offline shell is self-contained and explains the private-data boundary',()=>{
 const offline=fs.readFileSync(path.join(root,'public/offline.html'),'utf8');
 assert.match(offline,/phone or tablet/i);
 assert.match(offline,/customer, crew, and operations information is never stored/i);
 assert.doesNotMatch(offline,/<script\b/i);
 assert.doesNotMatch(offline,/\.mp4/i);
});
