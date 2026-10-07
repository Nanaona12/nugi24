import { createFileRoute } from "@tanstack/react-router";
import { authenticateAiRequest } from "@/lib/admin-ai.server";

export const Route = createFileRoute("/api/admin-ai-transcribe")({ server: { handlers: {
  POST: async ({ request }) => {
    try {
      const { db, owner } = await authenticateAiRequest(request);
      const { data: conversation } = await db.from("admin_ai_conversations").select("blocked_status,blocked_message").eq("tenant_id", owner.id).maybeSingle();
      if (conversation?.blocked_status) return Response.json({ message: conversation.blocked_message }, { status: conversation.blocked_status });
      const cap = 8 * 1024 * 1024;
      if (Number(request.headers.get("content-length")) > cap) return Response.json({ message: "Rekaman terlalu besar." }, { status: 413 });
      if (!request.body) return Response.json({ message: "Rekaman kosong." }, { status: 400 });
      const chunks: Uint8Array[] = [];
      const reader = request.body.getReader();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > cap) { await reader.cancel(); return Response.json({ message: "Rekaman terlalu besar." }, { status: 413 }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size < 2048 || file.type !== "audio/wav") return Response.json({ message: "Rekam suara kembali; berkas WAV diperlukan." }, { status: 400 });
      const key = process.env.LOVABLE_API_KEY;
      if (!key) return Response.json({ message: "AI belum dikonfigurasi." }, { status: 401 });
      const upstream = new FormData();
      upstream.set("file", file); upstream.set("model", "openai/gpt-transcribe"); upstream.set("stream", "true"); upstream.set("response_format", "json");
      const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" }, body: upstream, signal: request.signal,
      });
      if (response.status === 402 || response.status === 403) {
        const json = await response.clone().json().catch(() => null);
        const { error } = await db.from("admin_ai_conversations").update({ blocked_status: response.status,
          blocked_message: json?.message || json?.error?.message || "Akses AI ditangguhkan." }).eq("tenant_id", owner.id);
        if (error) console.error("Transcription block persistence failed", error.code);
      }
      return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "text/event-stream", "cache-control": "no-cache, no-transform" } });
    } catch (error) {
      if (error instanceof Response) return error;
      if (error instanceof Error && error.name === "AbortError") return new Response(null, { status: 499 });
      return Response.json({ message: error instanceof Error ? error.message : "Rekaman gagal diproses." }, { status: 400 });
    }
  },
} } });