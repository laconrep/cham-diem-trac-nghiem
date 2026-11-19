// GET /api/sessions/[id]/results — danh sách bài nộp + kết quả chấm của phiên.
//
// Thứ tự hiển thị (bác chốt): bài nào chấm trước nằm đầu, chấm sau nằm tiếp
// theo — sắp xếp theo thời gian chấm xong (graded_at) tăng dần. Bài chưa chấm
// (chưa có graded_at) nằm cuối, theo thứ tự tải lên, kèm trạng thái để GV
// chụp tiếp mà vẫn biết bài nào xong rồi:
//   queued = Đang chờ chấm · grading = Đang chấm · done = Đã chấm xong · error = Lỗi
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const db = getSupabase();
    const { data: submissions, error } = await db
      .from("submissions")
      .select("id, student_name, files, status, job_id, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const subs = submissions ?? [];
    const { data: results } = await db
      .from("grade_results")
      .select("*")
      .in(
        "submission_id",
        subs.map((s) => s.id as string)
      )
      .order("graded_at", { ascending: true });
    const bySub = new Map<string, Record<string, unknown>>();
    for (const r of results ?? []) bySub.set(r.submission_id as string, r as Record<string, unknown>);

    const items = subs.map((s) => ({ submission: s, result: bySub.get(s.id as string) ?? null }));
    // Bài đã chấm trước nằm đầu (graded_at tăng dần); bài chưa chấm nằm cuối theo thứ tự tải lên.
    items.sort((a, b) => {
      const ga = (a.result?.graded_at as string | undefined) ?? null;
      const gb = (b.result?.graded_at as string | undefined) ?? null;
      if (ga && gb) return ga.localeCompare(gb);
      if (ga) return -1;
      if (gb) return 1;
      return String(a.submission.created_at).localeCompare(String(b.submission.created_at));
    });

    const { data: jobs } = await db
      .from("grade_jobs")
      .select("id, status, total, completed, progress, stage")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(5);
    return Response.json({ ok: true, items, jobs: jobs ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
