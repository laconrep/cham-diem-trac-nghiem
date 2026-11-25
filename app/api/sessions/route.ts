// GET /api/sessions — liệt kê phiên (GV chỉ thấy phiên của mình; admin
// thấy tất cả). POST /api/sessions — tạo phiên mới (chỉ sau khi GV đã
// duyệt tiêu chí chấm ở màn hình tạo phiên); phiên mới mang owner_id
// là tài khoản đang đăng nhập.
import { getSupabase } from "@/lib/supabase";
import { requireApiUser, isAdmin } from "@/lib/auth";
import type { AnswerKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const db = getSupabase();
    let query = db
      .from("cdtn_sessions")
      .select("id, title, status, created_at")
      .order("created_at", { ascending: false });
    if (!isAdmin(user)) query = query.eq("owner_id", user.id);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, sessions: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
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
      .insert({ title, answer_key: answerKey, criteria: answerKey, status: "active", owner_id: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, id: data.id as string });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
