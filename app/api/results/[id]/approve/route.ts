// POST /api/results/[id]/approve — GV duyệt 1 kết quả chấm (duyệt xong mới
// tính là điểm chính thức; bài đã duyệt không bị chấm lại đè).
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getSupabase();
    const { error } = await db.from("grade_results").update({ approved: true }).eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
