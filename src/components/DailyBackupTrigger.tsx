import { useEffect } from "react";
import { getBackupStatus, syncTenantBackup, recordBackupFailure } from "@/lib/google-backup.functions";

const SESSION_KEY = "dp.backup.autorun";

/** Menjalankan backup ke Google Spreadsheet sekali sehari saat aplikasi dibuka. */
export function DailyBackupTrigger() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const today = new Date().toDateString();
        if (sessionStorage.getItem(SESSION_KEY) === today) return;
        const status = await getBackupStatus();
        if (cancelled || !status.connected || !status.enabled) return;
        const last = status.lastBackupAt ? new Date(status.lastBackupAt).toDateString() : null;
        if (last === today) {
          sessionStorage.setItem(SESSION_KEY, today);
          return;
        }
        sessionStorage.setItem(SESSION_KEY, today);
        try {
          await syncTenantBackup();
        } catch (e: any) {
          await recordBackupFailure({ data: { message: e?.message || "Backup otomatis gagal" } });
        }
      } catch {
        /* diam saja: backup otomatis tidak boleh mengganggu pemakaian */
      }
    };
    const t = setTimeout(run, 4000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return null;
}
