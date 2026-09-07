-- Run once in the dedicated Trios Supabase project after the PostgreSQL migration.
-- Photos are fetched only through server routes after ownership/crew checks.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('trios-private','trios-private',false,4194304,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=4194304,allowed_mime_types=EXCLUDED.allowed_mime_types;
