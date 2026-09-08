import postgres from 'postgres';
let connection: ReturnType<typeof postgres> | undefined;
function client(){
 if(!process.env.DATABASE_URL)throw new Error('The property database has not been connected.');
 return connection??=postgres(process.env.DATABASE_URL,{prepare:false,max:3,idle_timeout:20,connect_timeout:10,types:{bigint:{to:20,from:[20],serialize:(v:any)=>String(v),parse:(v:string)=>Number(v)}}});
}
// Only application-authored SQL reaches this adapter. User values remain parameters.
export function postgresQuery(source:string){
 let q=source.replace(/`([^`]+)`/g,'"$1"');
 q=q.replace(/json_each\(json_extract\(r\.details,'\$\.photos'\)\)/g,"jsonb_array_elements_text(COALESCE(r.details::jsonb->'photos','[]'::jsonb)) AS photo(value)");
 q=q.replace(/json_each\(j\.photos\)/g,'jsonb_array_elements_text(j.photos::jsonb) AS photo(value)');
 if(/^INSERT OR IGNORE /i.test(q))q=q.replace(/^INSERT OR IGNORE /i,'INSERT ')+' ON CONFLICT DO NOTHING';
 q=q.replace('SET count=count+1 WHERE count<30','SET count=planner_usage.count+1 WHERE planner_usage.count<30');
 let output='',quoted=false,n=0;
 for(let i=0;i<q.length;i++){
  const char=q[i];
  if(char==="'"){if(quoted&&q[i+1]==="'"){output+="''";i++;continue}quoted=!quoted}
  output+=char==='?'&&!quoted?'$'+(++n):char;
 }
 return output;
}
async function execute(tx:any,statement:Statement){const rows=await tx.unsafe(postgresQuery(statement.query),statement.args);return {results:Array.from(rows),meta:{changes:rows.count},success:true}}
class Statement{
 args:any[]=[];
 constructor(public query:string, private runner?: (statement: Statement) => Promise<any>){}
 bind(...args:any[]){this.args=args;return this}
 async all(){return this.runner ? this.runner(this) : (await database.batch([this]))[0]}
 async first(){return (await this.all()).results[0]??null}
 async run(){return this.all()}
}
export const database={
 prepare(query:string){return new Statement(query)},
 async transaction<T>(work:(db:{prepare(query:string):Statement})=>Promise<T>):Promise<T>{
  return client().begin(async tx=>{
   await tx`SET LOCAL search_path TO trios, public`;
   await tx`SELECT pg_advisory_xact_lock(hashtext('trios-write'))`;
   return work({prepare(query:string){return new Statement(query,statement=>execute(tx,statement))}});
  }) as Promise<T>;
 },
 async batch(statements:Statement[]):Promise<any[]>{
  return client().begin(async tx=>{
   await tx`SET LOCAL search_path TO trios, public`;
   // Serialize this small business's mutations, preserving SQLite's write semantics.
   if(statements.some(s=>!/^\s*SELECT\b/i.test(s.query)))await tx`SELECT pg_advisory_xact_lock(hashtext('trios-write'))`;
   const results=[];for(const statement of statements)results.push(await execute(tx,statement));return results;
  }) as Promise<any[]>;
 }
};
