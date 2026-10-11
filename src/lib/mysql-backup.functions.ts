import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { PairingSchema } from './mysql-backup-domain';
import { z } from 'zod';
export const loadMysqlBackup = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data:tenant,error}=await context.supabase.from('tenants').select('id').eq('owner_user_id',context.userId).single();
 if(error||!tenant) throw new Error('Backup MySQL hanya untuk pemilik toko.');
 const {data:devices,error:de}=await context.supabase.from('mysql_backup_devices').select('id,label,created_at,revoked_at,last_seen_at,last_ack').eq('tenant_id',tenant.id).order('created_at',{ascending:false});
 const {data:events,error:ee,count}=await context.supabase.from('mysql_backup_events').select('seq,recorded_at',{count:'exact'}).eq('tenant_id',tenant.id).order('seq',{ascending:false}).limit(1);
 if(de||ee) throw new Error('Status backup belum dapat dimuat.');
 return {devices:devices??[],count:count??0,latest:events?.[0]?.seq??0};
});
export const pairMysqlDevice=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).validator((input:unknown)=>z.object({label:z.string().trim().min(1).max(80),pairing:PairingSchema}).parse(input)).handler(async({context,data})=>{
 const {data:tenant,error}=await context.supabase.from('tenants').select('id').eq('owner_user_id',context.userId).single();
 if(error||!tenant) throw new Error('Hanya pemilik toko yang dapat menyetujui komputer.');
 await crypto.subtle.importKey('jwk',data.pairing.public_key,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {error:save}=await supabaseAdmin.from('mysql_backup_devices').insert({tenant_id:tenant.id,label:data.label,token_hash:data.pairing.token_hash,public_key:data.pairing.public_key});
 if(save) throw new Error('Perangkat gagal disetujui; pastikan belum pernah dipasangkan.');
 return {ok:true};
});
export const revokeMysqlDevice=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).validator((input:unknown)=>z.object({id:z.string().uuid()}).parse(input)).handler(async({context,data})=>{
 const {data:tenant,error}=await context.supabase.from('tenants').select('id').eq('owner_user_id',context.userId).single();
 if(error||!tenant) throw new Error('Akses ditolak.');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data:rows,error:save}=await supabaseAdmin.from('mysql_backup_devices').update({revoked_at:new Date().toISOString()}).eq('id',data.id).eq('tenant_id',tenant.id).select('id');
 if(save||!rows?.length) throw new Error('Perangkat tidak ditemukan.');
 return {ok:true};
});
