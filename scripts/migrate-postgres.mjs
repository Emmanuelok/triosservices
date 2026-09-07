import fs from 'node:fs/promises';
import postgres from 'postgres';
import { createHash } from 'node:crypto';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL to the dedicated Trios PostgreSQL connection.');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
try{await sql.begin(async tx=>{
 await tx`SELECT pg_advisory_xact_lock(hashtext('trios-migrate'))`;
 await tx`CREATE SCHEMA IF NOT EXISTS trios`;
 await tx`CREATE TABLE IF NOT EXISTS trios.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL)`;
 const files=(await fs.readdir(new URL('../migrations/postgres/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
 for(const name of files){const source=await fs.readFile(new URL('../migrations/postgres/'+name,import.meta.url),'utf8'),checksum=createHash('sha256').update(source).digest('hex');const rows=await tx`SELECT checksum FROM trios.schema_migrations WHERE name=${name}`;if(rows.length){if(rows[0].checksum!==checksum)throw new Error('Previously applied migration changed: '+name);continue}await tx.unsafe(source);await tx`INSERT INTO trios.schema_migrations(name,checksum) VALUES (${name},${checksum})`;console.log('Applied '+name)}
});}finally{await sql.end()}
