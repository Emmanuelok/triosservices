import { createClient } from '@supabase/supabase-js';
function bucket(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Private photo storage has not been connected.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('trios-private');
}
export const privateStorage={
 async put(id:string,bytes:Uint8Array,options:{httpMetadata:{contentType:string}}){const {error}=await bucket().upload(id,bytes,{contentType:options.httpMetadata.contentType,upsert:false});if(error)throw error},
 async get(id:string){const {data,error}=await bucket().download(id);if(error){if(String(error.status)==='404'||String(error.status)==='400')return null;throw error}return data?{body:data.stream()}:null},
 async delete(id:string){const {error}=await bucket().remove([id]);if(error)throw error}
};
