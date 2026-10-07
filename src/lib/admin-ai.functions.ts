import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const loadAdminAi = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { getAiConversation, refreshAiImages } = await import("./admin-ai.server");
  const { owner, conversation } = await getAiConversation(context.supabase, context.userId);
  const { data: drafts, error } = await context.supabase.from("admin_ai_po_drafts").select("tool_call_id,status,po_id")
    .eq("tenant_id", owner.id).eq("conversation_id", conversation.id);
  if (error) throw new Error(error.message);
  return { id: conversation.id, tenantId: owner.id, name: owner.name,
    messagesJson: JSON.stringify(await refreshAiImages(context.supabase, owner.id, conversation.messages as unknown as import("ai").UIMessage[])),
    drafts, blockedMessage: conversation.blocked_message };
});

export const decideAdminAiPo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ toolCallId: z.string().min(1), approve: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { decideAiDraft } = await import("./admin-ai.server");
    return decideAiDraft(context.supabase, context.userId, data.toolCallId, data.approve);
  });