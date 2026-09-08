export function safeReturnPath(value:string|undefined|null,fallback='/portal'){
 if(!value||value.length>2048||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return fallback;
 try{
  const url=new URL(value,'https://trios.local');
  if(url.origin!=='https://trios.local')return fallback;
  // Validate decoded paths too: routers normalize encoded slashes, dot segments
  // and route names after a redirect, which must not reach auth/API endpoints.
  let path=url.pathname;
  for(let pass=0;pass<4;pass++){
   if(path.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(path))return fallback;
   const normalized=new URL(path,'https://trios.local');
   if(normalized.origin!=='https://trios.local'||/^\/(sign-in|sign-out|auth|api)(\/|$)/i.test(normalized.pathname))return fallback;
   const decoded=decodeURIComponent(path);if(decoded===path)return url.pathname+url.search+url.hash;
   path=decoded;
  }
  return fallback;
 }catch{return fallback}
}
export const signInPath=(returnTo='/portal')=>'/sign-in?return_to='+encodeURIComponent(safeReturnPath(returnTo));
export const signOutPath=(returnTo='/')=>'/sign-out?return_to='+encodeURIComponent(safeReturnPath(returnTo,'/'));
