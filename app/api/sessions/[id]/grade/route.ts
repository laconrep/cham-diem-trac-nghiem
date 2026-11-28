// POST /api/sessions/[id]/grade — nút "Chấm bài AI": tạo job cho toàn bộ
// bài chưa chấm trong phiên. Nếu đã có job đang chạy thì gắn các bài chưa
// chấm vào job đó (không tạo job trùng). Các bài tải lên sau đó tự vào hàng
// chờ qua /api/submissions nên GV không phải bấm lại từng lần.
import { getSupabase } from "@/lib/supabase";
import { requireApiUser, checkSessionAccess, forbiddenResponse } from "@/lib/auth";
import { jobModeOf } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { id: sessionId } = await params;
    const access = await checkSessionAccess(sessionId, user);
    if (!access.allowed) return forbiddenResponse();
    const db = getSupabase();
    const { data: session, error: sErr } = await db
      .from("cdtn_sessions")
      .select("id")
      .eq("id", sessionId)
      .single();
    if (sErr || !session) return Response.json({ ok: false, error: "Không tìm thấy phiên." }, { status: 404 });

    const { data: ungraded } = await db
      .from("cdtn_submissions")
      .select("id")
      .eq("session_id", sessionId)
      .in("status", ["queued", "error"])
      .order("created_at", { ascending: true });
    const ids = (ungraded ?? []).map((u) => u.id as string);
    if (ids.length === 0) {
      return Response.json({ ok: true, jobId: null, message: "Không còn bài nào chưa chấm." });
    }

    const { data: active } = await db
      .from("cdtn_grade_jobs")
      .select("*")
      .eq("session_id", sessionId)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Job đang chạy là job chấm lại từng phần thì KHÔNG gắn bài chưa chấm vào
    // (bài mới sẽ bị chấm thiếu phần) — chờ job đó xong rồi chấm tiếp.
    if (active && jobModeOf(active as { mode?: string | null; stage?: string | null }) !== "full") {
      return Response.json({
        ok: true,
        jobId: active.id as string,
        message: "Đang có job chấm lại chạy. Chờ xong rồi bấm chấm tiếp các bài chưa chấm.",
      });
    }
    if (active) {
      // Chỉ gắn các bài chưa thuộc job đang chạy (tránh đếm trùng).
      const { data: already } = await db
        .from("cdtn_submissions")
        .select("id")
        .eq("job_id", active.id)
        .in("status", ["queued", "error"]);
      const alreadyIds = new Set((already ?? []).map((a) => a.id as string));
      const fresh = ids.filter((x) => !alreadyIds.has(x));
      if (fresh.length > 0) {
        await db.from("cdtn_submissions").update({ job_id: active.id }).in("id", fresh);
        await db
          .from("cdtn_grade_jobs")
          .update({ total: (active.total as number) + fresh.length })
          .eq("id", active.id);
      }
      return Response.json({ ok: true, jobId: active.id as string, attached: fresh.length });
    }

    const { data: job, error } = await db
      .from("cdtn_grade_jobs")
      .insert({ session_id: sessionId, status: "queued", total: ids.length, completed: 0, progress: 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await db.from("cdtn_submissions").update({ job_id: job.id }).in("id", ids);
    return Response.json({ ok: true, jobId: job.id as string, attached: ids.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
