import { createFileRoute } from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/mysql-backup')({server:{handlers:{POST:async({request})=>{
 const {serveMysqlBackup}=await import('@/lib/mysql-backup.server');
 return serveMysqlBackup(request);
}}}});
