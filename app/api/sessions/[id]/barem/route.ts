// PATCH /api/sessions/[id]/barem — sửa barem tự luận SAU khi đã duyệt/lưu
// phiên (vd GV phát hiện barem thiếu ý hoặc sai điểm sau khi đã chấm).
// Chỉ thay phần essayBarem trong answer_key + criteria; điểm các bài đã
// chấm giữ nguyên cho đến khi GV bấm "Chấm lại tự luận" để áp barem mới.
import { getSupabase } from "@/lib/supabase";
import { requireApiUser, checkSessionAccess, forbiddenResponse } from "@/lib/auth";
import type { AnswerKey, EssayBaremStep } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { id: sessionId } = await params;
    const access = await checkSessionAccess(sessionId, user);
    if (!access.allowed) return forbiddenResponse();

    const body = (await req.json().catch(() => ({}))) as {
      essayBarem?: Array<{ content?: unknown; points?: unknown }>;
    };
    if (!Array.isArray(body.essayBarem)) {
      return Response.json({ ok: false, error: "Thiếu danh sách ý barem." }, { status: 400 });
    }
    // Chuẩn hoá: bỏ ý trống, điểm làm tròn về bội số 0,25 (thang nhỏ nhất),
    // tối thiểu 0,25đ/ý; đánh id b1, b2... như lúc tạo phiên.
    const essayBarem: EssayBaremStep[] = body.essayBarem
      .map((s) => ({
        content: typeof s.content === "string" ? s.content.trim() : "",
        points: typeof s.points === "number" ? s.points : parseFloat(String(s.points ?? "").replace(",", ".")) || 0,
      }))
      .filter((s) => s.content)
      .map((s, i) => ({
        id: `b${i + 1}`,
        content: s.content,
        points: Math.max(0.25, Math.round(s.points * 4) / 4),
      }));

    const db = getSupabase();
    const { data: session, error: sErr } = await db
      .from("cdtn_sessions")
      .select("answer_key, criteria")
      .eq("id", sessionId)
      .single();
    if (sErr || !session) return Response.json({ ok: false, error: "Không tìm thấy phiên." }, { status: 404 });

    const oldKey = (session.answer_key ?? session.criteria) as AnswerKey | null;
    if (!oldKey) return Response.json({ ok: false, error: "Phiên chưa có tiêu chí chấm." }, { status: 400 });
    const newKey: AnswerKey = { ...oldKey, essayBarem };
    const { error } = await db
      .from("cdtn_sessions")
      .update({ answer_key: newKey, criteria: newKey })
      .eq("id", sessionId);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, essayBarem });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
