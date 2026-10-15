import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { assistantEnabled } from "@/lib/ai-assistant";
import { ConversationNotFound, listConversations, readConversation } from "@/lib/ai-assistant-history";
import { z } from "zod";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: NextRequest) {
  if (!assistantEnabled()) return reply({ error: "Unavailable." },404);
  const profile = await getSessionProfile();
  if (!profile) return reply({ error: "Please sign in." },401);
  if (!["admin","management_viewer"].includes(profile.role)) return reply({ error: "Access denied." },403);
  const id = req.nextUrl.searchParams.get("conversationId");
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
  if ((id && !z.string().uuid().safeParse(id).success) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return reply({ error: "Invalid history request." },400);
  try { return reply(id ? await readConversation(profile.id,id,offset) : { conversations: await listConversations(profile.id,offset) }); }
  catch (error) { return reply({ error: error instanceof ConversationNotFound ? "Conversation not found." : "Chat history is unavailable. Please retry." }, error instanceof ConversationNotFound ? 404 : 503); }
}
