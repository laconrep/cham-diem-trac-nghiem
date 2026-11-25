// GET /api/export/[sessionId] — tải file Excel bảng điểm phiên (.xlsx).
// 4 sheet theo thiết kế của cham_diem_core.py (ThS. Nguyễn Văn Sang).
import { getSupabase } from "@/lib/supabase";
import { buildSessionExcel, type ExportRow } from "@/lib/excel";
import { requireApiUser, checkSessionAccess, forbiddenResponse } from "@/lib/auth";
import type { AnswerKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { sessionId } = await params;
    const access = await checkSessionAccess(sessionId, user);
    if (!access.allowed) return forbiddenResponse();
    const db = getSupabase();
    const { data: session, error: sErr } = await db
      .from("cdtn_sessions")
      .select("id, title, answer_key")
      .eq("id", sessionId)
      .single();
    if (sErr || !session) return Response.json({ ok: false, error: "Không tìm thấy phiên." }, { status: 404 });

    const { data: submissions, error: subErr } = await db
      .from("cdtn_submissions")
      .select("id, student_name, files, status, job_id, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (subErr) throw new Error(subErr.message);
    const subs = submissions ?? [];
    const { data: results } = await db
      .from("cdtn_grade_results")
      .select("*")
      .in("submission_id", subs.map((s) => s.id as string));
    const bySub = new Map<string, (typeof results extends (infer T)[] | null ? T : never)>();
    for (const r of results ?? []) bySub.set(r.submission_id as string, r as never);

    const rows: ExportRow[] = subs.map((s) => ({
      submission: s as unknown as ExportRow["submission"],
      result: (bySub.get(s.id as string) as unknown as ExportRow["result"]) ?? null,
    }));
    const buf = await buildSessionExcel(
      session.title as string,
      (session.answer_key as AnswerKey | null) ?? null,
      rows
    );
    const safeTitle = String(session.title).replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="BangDiem_${safeTitle}.xlsx"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
