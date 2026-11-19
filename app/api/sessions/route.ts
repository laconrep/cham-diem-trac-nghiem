// GET /api/sessions — liệt kê phiên. POST /api/sessions — tạo phiên mới
// (chỉ sau khi GV đã duyệt tiêu chí chấm ở màn hình tạo phiên).
import { getSupabase } from "@/lib/supabase";
import type { AnswerKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from("cdtn_sessions")
      .select("id, title, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, sessions: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { title?: string; answerKey?: AnswerKey };
    const title = (body.title ?? "").trim();
    if (!title) return Response.json({ ok: false, error: "Thiếu tên phiên." }, { status: 400 });
    const answerKey = body.answerKey;
    if (!answerKey || !Array.isArray(answerKey.questions) || answerKey.questions.length === 0) {
      return Response.json(
        { ok: false, error: "Chưa có tiêu chí chấm. Hãy tải file Word đáp án và duyệt tiêu chí trước." },
        { status: 400 }
      );
    }
    const db = getSupabase();
    const { data, error } = await db
      .from("cdtn_sessions")
      .insert({ title, answer_key: answerKey, criteria: answerKey, status: "active" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, id: data.id as string });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
