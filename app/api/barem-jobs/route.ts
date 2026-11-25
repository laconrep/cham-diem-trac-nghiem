// POST /api/barem-jobs — tạo job nhờ AI tách ý + dựng barem tự luận từ
// nguyên văn phần tự luận trong file Word (trang tạo phiên gọi sau khi nạp
// file). Trả jobId để trang poll; jobId null khi bảng chưa có (migration 004
// chưa chạy) — trang giữ nguyên bản tách máy.
import { requireApiUser } from "@/lib/auth";
import { createBaremJob, normalizeBaremSteps } from "@/lib/ai/barem-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const body = (await req.json()) as { rawText?: string; machineBarem?: unknown };
    const rawText = (body.rawText ?? "").trim();
    if (!rawText) {
      return Response.json({ ok: false, error: "Thiếu nguyên văn phần tự luận." }, { status: 400 });
    }
    const machineBarem = normalizeBaremSteps(body.machineBarem);
    const job = await createBaremJob(user.id, rawText.slice(0, 20000), machineBarem);
    return Response.json({ ok: true, jobId: job?.id ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không tạo được job barem.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
