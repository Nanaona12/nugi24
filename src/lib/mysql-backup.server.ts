import { backupCursor } from './mysql-backup-domain';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
function encode(buffer: ArrayBuffer) {
 let s=''; for(const b of new Uint8Array(buffer)) s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function serveMysqlBackup(request:Request) {
 try {
  const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if(!token) return new Response('Unauthorized',{status:401});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const {data:device,error}=await supabaseAdmin.from('mysql_backup_devices').select('id,tenant_id,public_key,revoked_at,last_ack').eq('token_hash',hash).maybeSingle();
  if(error) return new Response('Unavailable',{status:503});
  if(!device||device.revoked_at) return new Response('Unauthorized',{status:401});
  if(Number(request.headers.get('content-length')??0)>2048) return new Response('Too large',{status:413});
  const raw=await request.text(); if(raw.length>2048) return new Response('Too large',{status:413});
  let after:string;
  try { after=backupCursor(JSON.parse(raw).after); } catch { return new Response('Invalid cursor',{status:400}); }
  const {data:rows,error:read}=await supabaseAdmin.rpc('mysql_backup_read_page',{p_tenant:device.tenant_id,p_after:after});
  if(read||!Array.isArray(rows)) return new Response('Unavailable',{status:503});
  const publicKey=await crypto.subtle.importKey('jwk',device.public_key as JsonWebKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const payload=JSON.stringify({tenant_id:device.tenant_id,events:rows.slice(0,100),has_more:rows.length>100});
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(payload));
  const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},publicKey,await crypto.subtle.exportKey('raw',aes));
  // after represents already-committed local history, not merely downloaded data.
  const ack=BigInt(after)>BigInt(device.last_ack)?after:String(device.last_ack);
  const {error:touch}=await supabaseAdmin.from('mysql_backup_devices').update({last_seen_at:new Date().toISOString(),last_ack:ack as unknown as number}).eq('id',device.id).is('revoked_at',null);
  if(touch) return new Response('Unavailable',{status:503});
  // Recheck revocation immediately before returning encrypted data.
  const {data:active}=await supabaseAdmin.from('mysql_backup_devices').select('revoked_at').eq('id',device.id).single();
  if(!active||active.revoked_at) return new Response('Unauthorized',{status:401});
  return Response.json({key:encode(wrapped),iv:encode(iv.buffer),data:encode(encrypted)},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 } catch {return new Response('Unavailable',{status:503});}
}
