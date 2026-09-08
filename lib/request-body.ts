export class BodyError extends Error { constructor(message:string, public status:number){super(message)} }
export async function boundedBody(req:Request,max:number):Promise<Uint8Array>{
 if(Number(req.headers.get('content-length')||0)>max)throw new BodyError('Request is too large.',413);
 if(!req.body)throw new BodyError('A request body is required.',400);
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){try{await reader.cancel()}catch{/* Keep the bounded-body error if an upstream stream fails to cancel. */}throw new BodyError('Request is too large.',413)}chunks.push(value)}}finally{reader.releaseLock()}
 const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}return out;
}
export async function boundedJson(req:Request,max=50000){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(req,max)))}catch(error){if(error instanceof BodyError)throw error;throw new BodyError('Please submit a valid form.',400)}}
