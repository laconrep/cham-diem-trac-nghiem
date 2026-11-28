// POST /api/sessions/[id]/regrade — nút "Chấm lại": tạo job chấm lại cho
// toàn bộ bài ĐÃ chấm trong phiên, theo 3 chế độ:
//   mode="essay" -> chỉ chấm lại tự luận (theo barem hiện tại của phiên)
//   mode="mcq"   -> chỉ chấm lại trắc nghiệm (theo đáp án hiện tại)
//   mode="both"  -> chấm lại cả hai phần
// Chấm lại xong điểm được SỬA trên đúng dòng kết quả cũ (submit_result ghi
// đè) và kết quả đã duyệt chuyển về chờ duyệt lại. Đang có job chấm chạy thì
// từ chối để tránh trộn hai chế độ trong cùng một hàng chờ.
import { getSupabase } from "@/lib/supabase";
import { requireApiUser, checkSessionAccess, forbiddenResponse } from "@/lib/auth";
import { insertGradeJob } from "@/lib/ai/jobs";
import { GRADE_MODE_LABEL, type GradeMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { id: sessionId } = await params;
    const access = await checkSessionAccess(sessionId, user);
    if (!access.allowed) return forbiddenResponse();

    const body = (await req.json().catch(() => ({}))) as { mode?: string };
    const rawMode = body.mode ?? "both";
    if (!["essay", "mcq", "both"].includes(rawMode)) {
      return Response.json({ ok: false, error: "Chế độ chấm lại không hợp lệ." }, { status: 400 });
    }
    const mode: GradeMode = rawMode === "both" ? "full" : (rawMode as GradeMode);

    const db = getSupabase();
    const { data: session, error: sErr } = await db
      .from("cdtn_sessions")
      .select("id")
      .eq("id", sessionId)
      .single();
    if (sErr || !session) return Response.json({ ok: false, error: "Không tìm thấy phiên." }, { status: 404 });

    const { data: active } = await db
      .from("cdtn_grade_jobs")
      .select("id")
      .eq("session_id", sessionId)
      .in("status", ["queued", "processing"])
      .limit(1)
      .maybeSingle();
    if (active) {
      return Response.json(
        { ok: false, error: "Đang có job chấm chạy trong phiên này. Chờ chấm xong rồi mới chấm lại." },
        { status: 409 }
      );
    }

    // Chỉ chấm lại các bài đã chấm xong hoặc lỗi (bài chưa chấm đi đường "Chấm bài AI").
    const { data: graded } = await db
      .from("cdtn_submissions")
      .select("id")
      .eq("session_id", sessionId)
      .in("status", ["done", "error"])
      .order("created_at", { ascending: true });
    const ids = (graded ?? []).map((g) => g.id as string);
    if (ids.length === 0) {
      return Response.json({ ok: true, jobId: null, message: "Chưa có bài nào đã chấm để chấm lại." });
    }

    const jobId = await insertGradeJob(db, sessionId, ids.length, mode);
    await db.from("cdtn_submissions").update({ status: "queued", job_id: jobId }).in("id", ids);
    return Response.json({
      ok: true,
      jobId,
      attached: ids.length,
      mode,
      message: `Đã xếp ${ids.length} bài vào hàng chờ ${GRADE_MODE_LABEL[mode].toLowerCase()}.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
