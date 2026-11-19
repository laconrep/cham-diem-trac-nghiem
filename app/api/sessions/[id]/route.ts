// GET /api/sessions/[id] — chi tiết 1 phiên (tiêu chí chấm + barem tự luận).
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getSupabase();
    const { data, error } = await db.from("sessions").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ ok: false, error: "Không tìm thấy phiên." }, { status: 404 });
    return Response.json({ ok: true, session: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
