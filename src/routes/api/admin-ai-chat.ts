import { createFileRoute } from "@tanstack/react-router";
import { handleAdminAiChat } from "@/lib/admin-ai.server";

export const Route = createFileRoute("/api/admin-ai-chat")({
  server: { handlers: { POST: ({ request }) => handleAdminAiChat(request) } },
});