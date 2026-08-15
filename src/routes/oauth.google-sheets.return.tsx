import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google-sheets/return")({
  head: () => ({
    meta: [
      { title: "Menyelesaikan koneksi Google - Dagang Pintar" },
      { name: "description", content: "Halaman penutup proses menghubungkan Google Spreadsheet untuk backup data toko." },
      { property: "og:title", content: "Menyelesaikan koneksi Google" },
      { property: "og:description", content: "Proses menghubungkan Google Spreadsheet sedang diselesaikan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("Menyelesaikan koneksi...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_sheets", code: code ?? null },
        window.location.origin,
      );
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Koneksi Google dibatalkan.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Koneksi selesai tanpa kode penukaran.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <h1 className="text-sm text-muted-foreground">{message}</h1>
    </main>
  );
}
