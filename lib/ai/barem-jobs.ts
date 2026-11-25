// Hàm nghiệp vụ cho job tách ý + dựng barem tự luận bằng AI (cổng MCP).
// Theo mẫu lib/ai/jobs.ts (job chấm): route chỉ làm plumbing, DB đi qua đây.
// Mọi hàm đều tolerant khi bảng cdtn_barem_jobs chưa có (migration 004 chưa
// chạy): trả null/{ok:false} thay vì nổ, để app giữ nguyên bản tách máy.
import { getSupabase } from "../supabase";
import { round2 } from "../scoring";
import type { BaremJobRow, EssayBaremStep } from "../types";

const ESSAY_STEP = 0.25;

/** Chuẩn hoá các bước barem worker gửi về: bỏ bước trống, điểm làm tròn về
 *  lưới 0,25 (tối thiểu 0,25), đánh lại id b1..bN. */
export function normalizeBaremSteps(input: unknown): EssayBaremStep[] {
  if (!Array.isArray(input)) return [];
  const out: EssayBaremStep[] = [];
  for (const raw of input) {
    const s = (raw ?? {}) as { content?: unknown; points?: unknown };
    const content = typeof s.content === "string" ? s.content.trim() : "";
    const pts = typeof s.points === "number" ? s.points : parseFloat(String(s.points ?? ""));
    if (!content || Number.isNaN(pts) || pts <= 0) continue;
    const snapped = Math.max(ESSAY_STEP, Math.round(pts / ESSAY_STEP) * ESSAY_STEP);
    out.push({ id: `b${out.length + 1}`, content, points: round2(snapped) });
  }
  return out;
}

/** Tạo job barem từ nguyên văn phần tự luận + bản tách máy (hiển thị tạm).
 *  Trả null nếu bảng chưa có / lỗi DB — trang tạo phiên giữ bản tách máy. */
export async function createBaremJob(
  ownerId: string | null,
  rawText: string,
  machineBarem: EssayBaremStep[]
): Promise<BaremJobRow | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("cdtn_barem_jobs")
    .insert({
      owner_id: ownerId,
      raw_text: rawText,
      machine_barem: machineBarem,
      status: "queued",
    })
    .select()
    .single();
  if (error || !data) return null;
  return data as unknown as BaremJobRow;
}

export async function getBaremJob(jobId: string): Promise<BaremJobRow | null> {
  const db = getSupabase();
  const { data, error } = await db.from("cdtn_barem_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as BaremJobRow;
}

export interface BaremJobSummary {
  id: string;
  status: string;
  raw_text_chars: number;
  machine_steps: number;
  created_at: string;
}

export async function listPendingBaremJobs(limit = 20): Promise<BaremJobSummary[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("cdtn_barem_jobs")
    .select("id, status, raw_text, machine_barem, created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((j) => ({
    id: j.id as string,
    status: j.status as string,
    raw_text_chars: typeof j.raw_text === "string" ? j.raw_text.length : 0,
    machine_steps: Array.isArray(j.machine_barem) ? j.machine_barem.length : 0,
    created_at: j.created_at as string,
  }));
}

/** Claim nguyên tử: chỉ 1 worker nhận được job đang queued. */
export async function claimBaremJob(jobId: string, workerId: string): Promise<BaremJobRow | null> {
  const db = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("cdtn_barem_jobs")
    .update({ status: "processing", worker_id: workerId, claimed_at: now, updated_at: now })
    .eq("id", jobId)
    .eq("status", "queued")
    .select()
    .single();
  if (error) return null;
  return data as unknown as BaremJobRow;
}

/** Worker nộp barem đã tách: chuẩn hoá bước, lưu result_barem, đánh dấu done. */
export async function submitBaremResult(
  jobId: string,
  workerId: string,
  stepsInput: unknown
): Promise<{ ok: boolean; error?: string; steps?: EssayBaremStep[] }> {
  const steps = normalizeBaremSteps(stepsInput);
  if (steps.length === 0) return { ok: false, error: "Barem gửi về không có bước nào hợp lệ" };
  const db = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("cdtn_barem_jobs")
    .update({
      status: "done",
      result_barem: steps,
      error: null,
      updated_at: now,
      done_at: now,
    })
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .in("status", ["processing", "queued"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Job không thuộc worker này hoặc đã kết thúc" };
  return { ok: true, steps };
}

export async function failBaremJob(
  jobId: string,
  workerId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("cdtn_barem_jobs")
    .update({ status: "error", error: reason.slice(0, 500), updated_at: now, done_at: now })
    .eq("id", jobId)
    .eq("worker_id", workerId)
    .in("status", ["processing", "queued"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Job không thuộc worker này hoặc đã kết thúc" };
  return { ok: true };
}
