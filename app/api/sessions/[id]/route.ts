// GET /api/sessions/[id] — chi tiết 1 phiên (tiêu chí chấm + barem tự luận).
// Chỉ chủ phiên hoặc admin mới xem được.
import { getSupabase } from "@/lib/supabase";
import { requireApiUser, checkSessionAccess, forbiddenResponse } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { id } = await params;
    const access = await checkSessionAccess(id, user);
    if (!access.allowed) return forbiddenResponse();
    const db = getSupabase();
    const { data, error } = await db.from("cdtn_sessions").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ ok: false, error: "Không tìm thấy phiên." }, { status: 404 });
    return Response.json({ ok: true, session: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
