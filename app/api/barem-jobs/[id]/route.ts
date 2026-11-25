// GET /api/barem-jobs/[id] — trang tạo phiên poll trạng thái job barem.
// Chỉ chủ job (hoặc admin) xem được. Khi status = done, trả resultBarem để
// trang tự điền vào danh sách ý cho GV duyệt/sửa.
import { requireApiUser, isAdmin } from "@/lib/auth";
import { getBaremJob } from "@/lib/ai/barem-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { id } = await ctx.params;
    const job = await getBaremJob(id);
    if (!job) return Response.json({ ok: false, error: "Không tìm thấy job barem." }, { status: 404 });
    if (!isAdmin(user) && job.owner_id !== user.id) {
      return Response.json({ ok: false, error: "Không có quyền xem job này." }, { status: 403 });
    }
    return Response.json({
      ok: true,
      status: job.status,
      resultBarem: job.status === "done" ? job.result_barem : null,
      error: job.error,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không đọc được trạng thái job barem.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
