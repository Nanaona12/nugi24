import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Wifi, WifiOff, Radio } from "lucide-react";

export type RealtimeStatus = "connecting" | "live" | "offline";

function agoLabel(d: Date | null) {
  if (!d) return "belum sinkron";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function SyncStatus({
  lastSync,
  status,
  onRefresh,
  refreshing,
  shiftId,
}: {
  lastSync: Date | null;
  status: RealtimeStatus;
  onRefresh: () => void;
  refreshing?: boolean;
  shiftId?: string | null;
}) {
  const [, force] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const effective: RealtimeStatus = !online ? "offline" : status;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge
        variant={effective === "live" ? "default" : effective === "connecting" ? "secondary" : "destructive"}
        className="gap-1"
      >
        {effective === "live" ? (
          <Radio className="h-3 w-3" />
        ) : effective === "connecting" ? (
          <Wifi className="h-3 w-3" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        {effective === "live" ? "Sinkron server" : effective === "connecting" ? "Menyambungkan..." : "Offline"}
      </Badge>
      <span className="text-muted-foreground">Update {agoLabel(lastSync)}</span>
      {shiftId && (
        <span className="text-muted-foreground">• Shift #{shiftId.slice(0, 8)}</span>
      )}
      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Sinkronkan
      </Button>
    </div>
  );
}
