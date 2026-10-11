import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { loadMysqlBackup, pairMysqlDevice, revokeMysqlDevice } from '@/lib/mysql-backup.functions';
import { PairingSchema } from '@/lib/mysql-backup-domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Download, Monitor, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
export function MysqlBackupPanel(){
 const load=useServerFn(loadMysqlBackup), pair=useServerFn(pairMysqlDevice), revoke=useServerFn(revokeMysqlDevice);
 const cache=useQueryClient();
 const state=useQuery({queryKey:['mysql-backup-status'],queryFn:()=>load(),refetchInterval:30000});
 const [label,setLabel]=useState(''),[pairing,setPairing]=useState(''),[busy,setBusy]=useState(false);
 const refresh=()=>cache.invalidateQueries({queryKey:['mysql-backup-status']});
 const approve=async()=>{
  setBusy(true);
  try{const bundle=PairingSchema.parse(JSON.parse(pairing));await pair({data:{label,pairing:bundle}});setPairing('');setLabel('');toast.success('Komputer disetujui');await refresh();}
  catch{toast.error('Periksa nama komputer dan isi pairing.json; hanya pemilik toko yang dapat menyetujui.');}finally{setBusy(false);}
 };
 const disconnect=async(id:string)=>{
  if(!confirm('Cabut akses komputer ini? Riwayat MySQL yang sudah tersimpan tetap ada.'))return;
  setBusy(true);try{await revoke({data:{id}});await refresh();toast.success('Akses komputer dicabut');}catch{toast.error('Gagal mencabut akses');}finally{setBusy(false);}
 };
 return <section className="space-y-4 border-b pb-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Monitor className="h-5 w-5 text-primary"/>Backup MySQL</h2><Button variant="outline" asChild><a href="/downloads/dagangpintar-mysql-backup.zip" download><Download className="mr-2 h-4 w-4"/>Unduh Program & Panduan</a></Button></div>
  <div className="flex flex-wrap gap-2"><Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3"/>Riwayat tidak ikut dihapus</Badge>{state.data&&<Badge variant="outline">{state.data.count.toLocaleString('id-ID')} versi tersedia</Badge>}</div>
  <p className="text-sm text-muted-foreground">Komputer mati: perubahan menunggu di Cloud. MySQL menyimpan semua versi saat sinkron kembali; data yang sudah dihapus sebelum fitur ini aktif tidak dapat dipulihkan.</p>
  {state.isPending?<p className="text-sm text-muted-foreground">Memuat status…</p>:state.isError?<p className="text-sm text-destructive">Pengaturan MySQL hanya tersedia bagi pemilik toko; status belum dapat dimuat.</p>:<>
   <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm">Nama komputer<Input value={label} onChange={e=>setLabel(e.target.value)} maxLength={80} placeholder="Laptop toko"/></label><label className="space-y-1 text-sm">Isi pairing.json<Textarea value={pairing} onChange={e=>setPairing(e.target.value)} placeholder="Tempel isi pairing.json dari program lokal" rows={3}/></label></div>
   <Button onClick={approve} disabled={busy||!label.trim()||!pairing.trim()}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Setujui Perangkat</Button>
   <div className="divide-y">{state.data?.devices.map(d=><div key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{d.label} <Badge variant={d.revoked_at?'secondary':'outline'}>{d.revoked_at?'Dicabut':'Diizinkan'}</Badge></p><p className="text-xs text-muted-foreground">{d.last_seen_at?`Terhubung ${new Date(d.last_seen_at).toLocaleString('id-ID')} · Tersimpan sampai ${d.last_ack}`:'Belum terhubung ke MySQL lokal'}</p></div>{!d.revoked_at&&<Button variant="destructive" size="sm" disabled={busy} onClick={()=>disconnect(d.id)}>Cabut Akses</Button>}</div>)}</div>
  </>}
 </section>;
}
