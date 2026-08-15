import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CloudUpload, ExternalLink, Link2, RefreshCw, Unlink } from "lucide-react";
import {
  getBackupStatus,
  startGoogleSheetsConnect,
  completeGoogleSheetsConnection,
  disconnectGoogleSheets,
  syncTenantBackup,
  setBackupEnabled,
  setBackupSpreadsheet,
  recordBackupFailure,
} from "@/lib/google-backup.functions";

type Status = Awaited<ReturnType<typeof getBackupStatus>>;

function waitForOAuthCompletion(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "google_sheets" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Koneksi Google gagal."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("Jendela Google ditutup sebelum selesai."));
    }, 500);
  });
}

function fmt(dt?: string | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function GoogleSheetsBackupCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus(await getBackupStatus());
    } catch (e: any) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onConnect = async () => {
    setBusy(true);
    const popup = window.open("", "google-oauth", "width=600,height=720");
    if (!popup) {
      setBusy(false);
      toast.error("Popup diblokir. Izinkan popup lalu coba lagi.");
      return;
    }
    try {
      const { authorizationUrl } = await startGoogleSheetsConnect();
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      if (code) await completeGoogleSheetsConnection({ data: { code } });
      toast.success("Google berhasil terhubung");
      await load();
    } catch (e: any) {
      popup.close();
      toast.error(e?.message || "Gagal menghubungkan Google");
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    setBusy(true);
    try {
      const res = await syncTenantBackup();
      toast.success(`Backup selesai: ${res.totalRows} baris`);
      await load();
    } catch (e: any) {
      const msg = e?.message || "Gagal backup ke spreadsheet";
      try {
        await recordBackupFailure({ data: { message: msg } });
      } catch {}
      toast.error(msg);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogleSheets();
      toast.success("Google diputuskan");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gagal memutuskan");
    } finally {
      setBusy(false);
    }
  };

  const onSaveSheet = async () => {
    setBusy(true);
    try {
      await setBackupSpreadsheet({ data: { url: sheetUrl } });
      setSheetUrl("");
      toast.success("Spreadsheet tujuan disimpan");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Link tidak valid");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (v: boolean) => {
    try {
      await setBackupEnabled({ data: { enabled: v } });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudUpload className="h-5 w-5 text-primary" /> Google Spreadsheet (Otomatis)
        </CardTitle>
        <CardDescription>
          Hubungkan akun Google toko Anda. Seluruh data akan otomatis disalin ke satu spreadsheet milik
          Anda — diperbarui sekali sehari saat aplikasi dibuka, dan bisa dijalankan kapan saja lewat
          tombol di bawah.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.connected ? (
          <Button onClick={onConnect} disabled={busy}>
            <Link2 className="mr-1 h-4 w-4" /> Hubungkan Google
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Terhubung</Badge>
              {status.spreadsheetUrl && (
                <a
                  href={status.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary underline"
                >
                  Buka spreadsheet <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch id="auto-backup" checked={!!status.enabled} onCheckedChange={onToggle} />
              <Label htmlFor="auto-backup" className="text-sm">Backup otomatis harian</Label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={onSync} disabled={busy}>
                <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                Backup Sekarang ke Spreadsheet
              </Button>
              <Button variant="outline" onClick={onDisconnect} disabled={busy}>
                <Unlink className="mr-1 h-4 w-4" /> Putuskan
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Pakai spreadsheet sendiri (tempel link Google Sheets)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <Button variant="outline" onClick={onSaveSheet} disabled={busy || !sheetUrl.trim()}>
                  Simpan
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div>
                Backup terakhir: <b>{fmt(status.lastBackupAt)}</b>{" "}
                {status.lastStatus === "failed" && <span className="text-destructive">(gagal)</span>}
              </div>
              {status.lastError && (
                <div className="mt-1 text-xs text-destructive break-words">{status.lastError}</div>
              )}
              {!!status.runs?.length && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {status.runs.map((r: any) => (
                    <li key={r.id}>
                      {fmt(r.created_at)} — {r.status === "success" ? `${r.total_rows} baris` : "gagal"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Catatan: backup otomatis berjalan bila aplikasi dibuka minimal sekali sehari. Bila izin Google
          dicabut, hubungkan ulang di halaman ini.
        </p>
      </CardContent>
    </Card>
  );
}
