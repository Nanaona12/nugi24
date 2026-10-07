import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage, type ToolUIPart } from "ai";
import { createParser } from "eventsource-parser";
import { Bot, Camera, Mic, Square, X, ShieldCheck, ClipboardList, TrendingUp, Loader2, RefreshCw, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { loadAdminAi, decideAdminAiPo } from "@/lib/admin-ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { recordWav } from "@/lib/admin-ai-recording";
import { PoDraftSchema, type AdminAiPoDraft } from "@/lib/admin-ai-domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputTools, PromptInputSubmit, PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolHeader, ToolContent, ToolOutput, ToolInput } from "@/components/ai-elements/tool";
import mascot from "@/assets/admin-ai-mascot.png";

export const Route = createFileRoute("/_authenticated/ai-admin")({
  head: () => ({ meta: [{ title: "AI Admin · Dagang Pintar" }, { name: "description", content: "Asisten privat toko untuk membuat draf PO dari nota dan menjelaskan keuntungan." }] }),
  component: AdminAiPage,
});
type Loaded = Awaited<ReturnType<typeof loadAdminAi>>;
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

function AdminAiPage() {
  const query = useQuery({ queryKey: ["admin-ai"], queryFn: () => loadAdminAi(), retry: false, refetchOnWindowFocus: false });
  if (query.isPending) return <div className="flex h-[70vh] items-center justify-center gap-3 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Memuat percakapan...</div>;
  if (query.isError) return <div className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-xl font-semibold">AI Admin belum dapat dibuka</h1><p className="text-muted-foreground">{query.error.message}</p><Button onClick={() => query.refetch()}>Coba lagi</Button></div>;
  return <AdminChat key={query.data.id} initial={query.data} />;
}

function AdminChat({ initial }: { initial: Loaded }) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [blocked, setBlocked] = useState(initial.blockedMessage);
  const [draftStates, setDraftStates] = useState(initial.drafts);
  const [deciding, setDeciding] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const recorder = useRef<Awaited<ReturnType<typeof recordWav>> | null>(null);
  const transcriptionAbort = useRef<AbortController | null>(null);
  const photoRef = useRef(photos);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/admin-ai-chat", fetch: async (input, init) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Silakan masuk kembali.");
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${data.session.access_token}`);
    const response = await fetch(input, { ...init, headers });
    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try { const parsed = JSON.parse(raw); message = parsed.message || parsed.error?.message || raw; } catch { /* plaintext error */ }
      if (response.status === 402 || response.status === 403) setBlocked(message);
      throw new Error(response.status === 429 ? "AI sedang ramai. Tunggu sebentar lalu coba lagi." : message || "Chat gagal dikirim.");
    }
    return response;
  } }), []);
  const { messages, sendMessage, status, error, stop, regenerate, addToolApprovalResponse, clearError } = useChat({
    id: initial.id, messages: JSON.parse(initial.messagesJson) as UIMessage[], transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (e) => toast.error(e.message),
    onFinish: () => { textarea.current?.focus(); },
  });
  const busy = status === "submitted" || status === "streaming";
  const disabled = busy || uploading || transcribing || recording || !!blocked;
  const pendingApproval = messages.some((m) => m.parts.some((p) => p.type === "tool-create_purchase_order_draft" && p.state === "approval-requested"));

  useEffect(() => { photoRef.current = photos; }, [photos]);
  useEffect(() => () => {
    transcriptionAbort.current?.abort();
    recorder.current?.stop().catch(() => {});
    photoRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setTimeout(() => { void finishRecording(); }, 60000);
    return () => clearTimeout(timer);
  }, [recording]);

  async function submit() {
    if (disabled || pendingApproval || (!text.trim() && !photos.length)) return;
    clearError();
    setUploading(true);
    try {
      const files = [];
      for (const photo of photos) {
        const extension = photo.file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
        const path = `${initial.tenantId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("admin-ai-media").upload(path, photo.file);
        if (uploadError) throw new Error(uploadError.message);
        const { data, error: signError } = await supabase.storage.from("admin-ai-media").createSignedUrl(path, 3600);
        if (signError) throw new Error(signError.message);
        files.push({ type: "file" as const, mediaType: photo.file.type, filename: photo.file.name, url: data.signedUrl });
      }
      const message = text.trim() || "Tolong baca nota ini dan bantu siapkan PO. Tanyakan informasi yang belum jelas.";
      setText("");
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      void sendMessage({ text: message, files });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Foto gagal dikirim."); }
    finally { setUploading(false); }
  }

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const next = [...list];
    if (photos.length + next.length > 4) { toast.error("Maksimal 4 foto per pesan."); return; }
    if (next.some((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 8 * 1024 * 1024)) {
      toast.error("Gunakan JPG, PNG, atau WebP, maksimal 8 MB per foto."); return;
    }
    setPhotos((prev) => [...prev, ...next.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  }

  async function startRecording() {
    try { recorder.current = await recordWav(); setRecording(true); }
    catch { toast.error("Mikrofon tidak dapat dibuka. Izinkan akses mikrofon lalu coba lagi."); }
  }
  async function finishRecording() {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null; setRecording(false); setTranscribing(true);
    const controller = new AbortController(); transcriptionAbort.current = controller;
    try {
      const file = await active.stop();
      if (file.size > 8 * 1024 * 1024) throw new Error("Rekaman terlalu panjang. Maksimal satu menit.");
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Silakan masuk kembali.");
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/admin-ai-transcribe", { method: "POST", body: form, signal: controller.signal,
        headers: { authorization: `Bearer ${data.session.access_token}` } });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const message = json?.message || json?.error?.message || "Suara gagal ditranskripsikan.";
        if (response.status === 402 || response.status === 403) setBlocked(message);
        throw new Error(message);
      }
      let transcript = "";
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const parser = createParser({ onEvent: ({ data: event }) => {
          if (event === "[DONE]") return;
          const payload = JSON.parse(event);
          if (payload.type === "error" || payload.error) throw new Error(payload.error?.message || payload.message || "Transkripsi gagal.");
          if (typeof payload.delta === "string") transcript += payload.delta;
          if (typeof payload.text === "string") transcript = payload.text;
        } });
        const reader = response.body!.getReader(); const decoder = new TextDecoder();
        for (;;) { const { done, value } = await reader.read(); if (done) break; parser.feed(decoder.decode(value, { stream: true })); }
      } else { transcript = (await response.json()).text || ""; }
      if (!transcript.trim()) throw new Error("Suara tidak terbaca. Rekam lebih jelas dan coba lagi.");
      setText((previous) => previous ? `${previous}\n${transcript.trim()}` : transcript.trim());
      toast.success("Suara sudah menjadi teks. Periksa sebelum dikirim."); textarea.current?.focus();
    } catch (e) { if (!(e instanceof Error && e.name === "AbortError")) toast.error(e instanceof Error ? e.message : "Rekaman gagal."); }
    finally { setTranscribing(false); transcriptionAbort.current = null; }
  }

  async function decide(part: ToolUIPart, approve: boolean) {
    if (part.state !== "approval-requested" || deciding) return;
    setDeciding(part.toolCallId);
    try {
      const result = await decideAdminAiPo({ data: { toolCallId: part.toolCallId, approve } });
      setDraftStates((prev) => [...prev.filter((d) => d.tool_call_id !== part.toolCallId), { tool_call_id: part.toolCallId, ...result }]);
      await addToolApprovalResponse({ id: part.approval.id, approved: approve });
      if (approve) toast.success("PO Draft dibuat. Stok dan Pembukuan belum berubah.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Persetujuan gagal."); }
    finally { setDeciding(null); }
  }

  return <div className="mx-auto flex h-[calc(100dvh-8rem)] min-h-[520px] max-w-5xl flex-col overflow-hidden rounded-2xl border bg-background shadow-sm md:h-[calc(100dvh-6rem)]">
    <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
      <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="size-5" /></div><div><h1 className="font-semibold">AI Admin</h1><p className="text-xs text-muted-foreground">Asisten toko {initial.name}</p></div></div>
      <Badge variant="outline" className="gap-1.5 text-xs"><ShieldCheck className="size-3.5" /><span className="hidden sm:inline">Khusus admin · </span>Chat tersimpan</Badge>
    </header>
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="gap-6 px-4 py-6 md:px-8">
        {!messages.length && <div className="mx-auto flex w-full max-w-2xl flex-col items-center py-6 text-center">
          <img src={mascot} width={144} height={144} alt="Asisten belanja toko" className="mb-4 size-36 object-contain" />
          <Badge variant="secondary" className="mb-3">Satu chat untuk urusan toko</Badge>
          <h2 className="text-2xl font-semibold tracking-tight">Ada yang bisa saya bantu?</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Kirim foto nota, ketik pembelian, atau gunakan suara. Saya bantu siapkan PO dan jelaskan keuntungan toko Anda.</p>
          <div className="mt-7 grid w-full gap-3 text-left sm:grid-cols-2">
            <button onClick={() => { setText("Saya habis belanja di supplier. Bantu buatkan PO dari nota ini."); picker.current?.click(); }} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"><ClipboardList className="mb-3 size-5 text-primary" /><p className="text-sm font-medium">Buat PO dari nota belanja</p><p className="mt-1 text-xs text-muted-foreground">Upload foto, lalu konfirmasi detailnya</p></button>
            <button onClick={() => { setText("Berapa keuntungan toko hari ini? Jelaskan omzet, modal dan laba bersihnya."); textarea.current?.focus(); }} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"><TrendingUp className="mb-3 size-5 text-primary" /><p className="text-sm font-medium">Cek keuntungan toko</p><p className="mt-1 text-xs text-muted-foreground">Tanyakan hari ini atau rentang tanggal</p></button>
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" />PO hanya dibuat setelah Anda tinjau dan setujui.</p>
        </div>}
        {messages.map((message) => <Message key={message.id} from={message.role}><MessageContent className={message.role === "assistant" ? "w-full" : ""}>
          {message.parts.map((part, index) => {
            if (part.type === "text") return <MessageResponse key={index}>{part.text}</MessageResponse>;
            if (part.type === "file") return <a key={index} href={part.url} target="_blank" rel="noreferrer"><img src={part.url} alt={part.filename || "Nota belanja"} loading="lazy" width={240} height={240} className="max-h-60 rounded-lg object-contain" /></a>;
            if (part.type === "reasoning") return <details key={index} className="text-xs text-muted-foreground"><summary className="flex cursor-pointer items-center gap-1"><ChevronDown className="size-3" />Proses analisis</summary><p className="mt-2 whitespace-pre-wrap">{part.text}</p></details>;
            if (part.type.startsWith("tool-")) {
              const toolPart = part as ToolUIPart;
              if (part.type === "tool-create_purchase_order_draft") {
                const parsed = PoDraftSchema.safeParse(toolPart.input);
                const state = draftStates.find((d) => d.tool_call_id === toolPart.toolCallId);
                return <div key={index} className="my-3 rounded-xl border bg-card p-4">
                  <div className="mb-4 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="size-4 text-primary" />Tinjau PO</h3><Badge variant="secondary">{state?.status === "approved" ? "PO Draft dibuat" : state?.status === "rejected" || toolPart.state === "output-denied" ? "Ditolak" : "Menunggu persetujuan"}</Badge></div>
                  {parsed.success ? <PoReview draft={parsed.data} /> : <p className="text-sm text-muted-foreground">Sedang menyusun rincian barang...</p>}
                  {toolPart.state === "output-error" && <p className="mt-3 text-sm text-destructive">{toolPart.errorText}</p>}
                  <p className="my-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Persetujuan membuat PO berstatus Draft, bukan penerimaan atau pembayaran. Stok dan Pembukuan tidak berubah.</p>
                  {state?.po_id && <Button asChild variant="outline"><Link to="/po">Lihat di halaman PO</Link></Button>}
                  {toolPart.state === "approval-requested" && <div className="flex flex-wrap gap-2"><Button disabled={!!deciding || busy || !!blocked} onClick={() => decide(toolPart, true)}>{deciding === toolPart.toolCallId ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}{state?.status === "approved" ? "Lanjutkan konfirmasi" : "Setujui & buat PO"}</Button><Button variant="outline" disabled={!!deciding || busy || state?.status === "approved" || !!blocked} onClick={() => decide(toolPart, false)}>Tolak / perbaiki</Button></div>}
                </div>;
              }
              const titles: Record<string, string> = { "tool-get_profit_summary": "Menghitung keuntungan toko", "tool-find_supplier": "Mencari supplier", "tool-find_products": "Mencocokkan barang dan satuan", "tool-get_purchase_order_history": "Membaca riwayat PO" };
              return <Tool key={index} className="my-2"><ToolHeader type={toolPart.type} state={toolPart.state} title={titles[part.type] || "Membaca data toko"} /><ToolContent><ToolInput input={toolPart.input} /><ToolOutput output={toolPart.output} errorText={toolPart.errorText} /></ToolContent></Tool>;
            }
            return null;
          })}
        </MessageContent></Message>)}
        {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /><Shimmer>{status === "submitted" ? "Membaca pesan Anda..." : "AI sedang menyiapkan jawaban..."}</Shimmer></div>}
      </ConversationContent><ConversationScrollButton />
    </Conversation>
    <div className="border-t bg-background px-4 pb-3 pt-4 md:px-6">
      {(error || blocked) && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"><span>{blocked || error?.message}</span>{!blocked && <Button size="sm" variant="outline" onClick={() => { clearError(); void regenerate(); }}><RefreshCw className="mr-1 size-3" />Coba lagi</Button>}</div>}
      {pendingApproval && <p className="mb-3 text-xs text-muted-foreground">Tinjau draf di atas. Pilih Setujui atau Tolak sebelum melanjutkan chat.</p>}
      {!!photos.length && <div className="mb-3 flex gap-2">{photos.map((photo, i) => <div key={photo.preview} className="relative"><img src={photo.preview} alt="Foto terlampir" width={64} height={64} className="size-16 rounded-lg border object-cover" /><button aria-label="Hapus foto" disabled={uploading} className="absolute -right-1 -top-1 rounded-full bg-foreground p-1 text-background" onClick={() => { URL.revokeObjectURL(photo.preview); setPhotos((prev) => prev.filter((_, index) => index !== i)); }}><X className="size-3" /></button></div>)}</div>}
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
      <PromptInput onSubmit={() => submit()} className="rounded-xl">
        <PromptInputTextarea ref={textarea} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled || pendingApproval} placeholder="Tanyakan keuntungan atau ceritakan belanja Anda..." className="min-h-16" />
        <PromptInputFooter><PromptInputTools>
          <PromptInputButton aria-label="Tambahkan foto nota" disabled={disabled || pendingApproval} onClick={() => picker.current?.click()}><Camera className="size-4" /></PromptInputButton>
          <PromptInputButton aria-label={recording ? "Selesai merekam" : "Rekam suara"} disabled={(disabled && !recording) || pendingApproval} onClick={() => recording ? finishRecording() : startRecording()} className={recording ? "text-destructive" : ""}>{recording ? <Square className="size-4" /> : <Mic className="size-4" />}</PromptInputButton>
          <span className="text-xs text-muted-foreground">{uploading ? "Mengunggah foto..." : transcribing ? "Mengubah suara ke teks..." : recording ? "Merekam · maksimal 1 menit" : "Foto · teks · suara"}</span>
        </PromptInputTools><PromptInputSubmit status={busy ? status : "ready"} onStop={() => stop()} disabled={!busy && (disabled || pendingApproval || (!text.trim() && !photos.length))} /></PromptInputFooter>
      </PromptInput>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">AI bisa keliru. Periksa supplier, satuan, jumlah, dan harga sebelum menyetujui PO.</p>
    </div>
  </div>;
}

function PoReview({ draft }: { draft: AdminAiPoDraft }) {
  return <><div className="mb-4 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Supplier: </span><strong>{draft.supplier}</strong></p><p><span className="text-muted-foreground">Pembayaran: </span>{draft.payment_terms === "credit" ? `Tempo · jatuh tempo ${draft.due_date}` : "Tunai"}</p>{draft.invoice_no && <p><span className="text-muted-foreground">Nota: </span>{draft.invoice_no}</p>}</div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b text-muted-foreground"><tr><th className="pb-2">Barang</th><th className="pb-2">Jumlah</th><th className="pb-2 text-right">Modal/satuan</th><th className="pb-2 text-right">Subtotal</th></tr></thead><tbody>{draft.items.map((it, i) => <tr key={i} className="border-b last:border-0"><td className="py-3 pr-3"><p className="font-medium">{it.product_name}</p><p className="mt-1 text-muted-foreground">{it.product_id ? it.product_code : "Barang belum ada di katalog"} · isi {it.unit_conversion} satuan dasar</p></td><td className="whitespace-nowrap py-3 pr-3">{it.qty} {it.unit_name}</td><td className="whitespace-nowrap py-3 text-right">{rupiah(it.unit_cost)}</td><td className="whitespace-nowrap py-3 pl-3 text-right">{rupiah(it.qty * it.unit_cost)}</td></tr>)}</tbody></table></div><p className="mt-4 text-right text-sm font-semibold">Total {rupiah(draft.items.reduce((sum, it) => sum + it.qty * it.unit_cost, 0))}</p>{draft.notes && <p className="mt-2 text-xs text-muted-foreground">Catatan: {draft.notes}</p>}</>;
}