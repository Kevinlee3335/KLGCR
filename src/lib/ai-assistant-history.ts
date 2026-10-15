import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
export class ConversationNotFound extends Error {}
export type SavedTurn = { id: string; question: string; answer: string; captured_at: string; created_at: string };
export async function listConversations(userId: string, offset = 0) {
  const db = await createClient();
  const { data, error } = await db.from("ai_assistant_conversations").select("id,title,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).order("id").range(offset, offset + 24);
  if (error) throw new Error("Chat history is unavailable.");
  return data ?? [];
}
export async function readConversation(userId: string, id: string, offset = 0, limit = 25) {
  const db = await createClient();
  const thread = await db.from("ai_assistant_conversations").select("id,title,updated_at").eq("user_id", userId).eq("id", id).maybeSingle();
  if (thread.error) throw new Error("Chat history is unavailable.");
  if (!thread.data) throw new ConversationNotFound();
  const result = await db.from("ai_assistant_turns").select("id,question,answer,captured_at,created_at").eq("user_id", userId).eq("conversation_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (result.error) throw new Error("Chat history is unavailable.");
  return { conversation: thread.data, turns: ((result.data ?? []) as SavedTurn[]).reverse() };
}
export async function prepareConversation(userId: string, question: string, id?: string) {
  if (id) {
    const { turns } = await readConversation(userId, id, 0, 4);
    return { id, history: turns.flatMap(turn => [{ role: "user" as const, text: turn.question }, { role: "assistant" as const, text: turn.answer.slice(0,6000) }]) };
  }
  const { data, error } = await createAdminClient().from("ai_assistant_conversations").insert({ user_id: userId, title: question.slice(0,100) }).select("id").single();
  if (error || !data) throw new Error("Unable to start saved chat. No AI request was made.");
  return { id: data.id as string, history: [] };
}
export async function saveConversationTurn(userId: string, id: string, question: string, answer: string, capturedAt: string) {
  const db = createAdminClient();
  // Composite FK prevents associating a turn with another account's conversation.
  const saved = await db.from("ai_assistant_turns").insert({ conversation_id: id, user_id: userId, question, answer, captured_at: capturedAt });
  if (saved.error) throw new Error("Unable to save answer.");
  // Ordering metadata is best-effort; the complete turn is already durably stored.
  await db.from("ai_assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id);
}
