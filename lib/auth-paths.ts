export function safeReturnPath(value:string|undefined|null,fallback='/portal'){
 if(!value||!value.startsWith('/')||value.startsWith('//'))return fallback;
 try{const url=new URL(value,'https://trios.local');if(url.origin!=='https://trios.local'||/^\/(sign-in|sign-out|auth|api)(\/|$)/.test(url.pathname))return fallback;return url.pathname+url.search+url.hash}catch{return fallback}
}
export const signInPath=(returnTo='/portal')=>'/sign-in?return_to='+encodeURIComponent(safeReturnPath(returnTo));
export const signOutPath=(returnTo='/')=>'/sign-out?return_to='+encodeURIComponent(safeReturnPath(returnTo,'/'));
