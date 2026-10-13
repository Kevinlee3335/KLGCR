import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";

export const runtime = "nodejs";
const MODEL = "gemini-2.5-flash";
const allowed = new Set(["admin", "management_viewer"]);
const sessions = new Map<string, { count: number; reset: number }>();

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!allowed.has(profile.role)) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "Gemini is not configured for this deployment." }, { status: 503 });
  const now = Date.now();
  const usage = sessions.get(profile.id);
  const current = usage && usage.reset > now ? usage : { count: 0, reset: now + 86400000 };
  if (current.count >= 30) return NextResponse.json({ error: "Daily test limit reached." }, { status: 429 });
  let question: unknown;
  try { ({ question } = await req.json()); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof question !== "string" || !question.trim() || question.length > 1500) return NextResponse.json({ error: "Question must be 1–1500 characters." }, { status: 400 });
  current.count++;
  sessions.set(profile.id, current);
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are KLGCR AI Assistant. Respond in the user's language. This is a preliminary general-knowledge test. You have NO access to KLGCR's database, jobs, inventory, complaints or employee records. Never claim to have inspected real company records. For company-specific questions, explain that the data connector is not yet enabled. Do not invent operational statistics. Be concise and practical." }] },
        contents: [{ role: "user", parts: [{ text: question.trim() }] }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.3 }
      }),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) {
      return NextResponse.json({ error: response.status === 429 ? "Gemini quota reached. Try later." : "Gemini request failed. Check model access and API quota." }, { status: response.status === 429 ? 429 : 502 });
    }
    const json = await response.json();
    const answer = json?.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text ?? "").join("").trim();
    if (!answer) return NextResponse.json({ error: "Gemini returned no answer." }, { status: 502 });
    return NextResponse.json({ answer, mode: "general-only", usage: json.usageMetadata ?? null });
  } catch {
    return NextResponse.json({ error: "Gemini connection timed out or failed." }, { status: 502 });
  }
}
