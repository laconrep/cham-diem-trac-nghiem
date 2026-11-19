// Hàm nghiệp vụ cho cổng MCP — mọi thao tác DB đi qua đây, route chỉ làm
// JSON-RPC plumbing (theo mẫu lib/ai/jobs.ts của EduSync).
import { getSupabase } from "../supabase";
import type { GradeJobRow, PerQuestionResult, SessionRow } from "../types";

export interface JobSummary {
  id: string;
  session_id: string;
  session_title: string;
  status: string;
  total: number;
  completed: number;
  created_at: string;
}

export async function listPendingJobs(workerId: string, limit = 20): Promise<JobSummary[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("grade_jobs")
    .select("id, session_id, status, total, completed, created_at, sessions(title)")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  void workerId;
  return (data ?? []).map((j) => ({
    id: j.id as string,
    session_id: j.session_id as string,
    session_title: ((j.sessions as unknown as { title?: string } | null)?.title ?? "") as string,
    status: j.status as string,
    total: j.total as number,
    completed: j.completed as number,
    created_at: j.created_at as string,
  }));
}

/** Claim nguyên tử: chỉ 1 worker nhận được job đang queued. */
export async function claimJob(jobId: string, workerId: string): Promise<GradeJobRow | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("grade_jobs")
    .update({ status: "processing", worker_id: workerId })
    .eq("id", jobId)
    .eq("status", "queued")
    .select()
    .single();
  if (error) return null;
  return data as unknown as GradeJobRow;
}

export async function getJobForWorker(jobId: string) {
  const db = getSupabase();
  const { data: job, error } = await db.from("grade_jobs").select("*").eq("id", jobId).single();
  if (error || !job) return null;
  const { data: session } = await db
    .from("sessions")
    .select("id, title, answer_key, criteria")
    .eq("id", job.session_id)
    .single();
  const { data: submissions } = await db
    .from("submissions")
    .select("id, student_name, files, status, created_at")
    .eq("job_id", jobId)
    .in("status", ["queued", "grading", "error"])
    .order("created_at", { ascending: true });
  return {
    job: job as unknown as GradeJobRow,
    session: session as unknown as SessionRow | null,
    submissions: (submissions ?? []) as unknown as Array<{
      id: string;
      student_name: string;
      files: Array<{ name: string; url: string; kind: string }>;
      status: string;
      created_at: string;
    }>,
  };
}

export async function setJobProgress(
  jobId: string,
  workerId: string,
  progress: number,
  stage?: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  const { error } = await db
    .from("grade_jobs")
    .update({ progress: Math.max(0, Math.min(100, progress)), stage: stage ?? null })
    .eq("id", jobId);
  if (error) return { ok: false, error: error.message };
  void workerId;
  return { ok: true };
}

export async function setSubmissionStatus(
  submissionId: string,
  status: "queued" | "grading" | "done" | "error"
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  const { error } = await db.from("submissions").update({ status }).eq("id", submissionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface SubmitResultInput {
  submissionId: string;
  scoreMcq: number;
  scoreEssay: number;
  scoreTotal: number;
  perQuestion: PerQuestionResult;
  feedback: string;
  annotatedImageUrl: string | null;
  /** Tên HS AI đọc được trên bài làm (bác chốt 19/11 ~17:03: không nhập tên tay —
   *  AI tự đọc tên trên phiếu và điền; bài nào đọc không ra thì giữ tên tạm "HS N"). */
  studentName?: string | null;
}

export async function submitJobResult(
  jobId: string,
  workerId: string,
  input: SubmitResultInput
): Promise<{ ok: boolean; error?: string; jobDone?: boolean }> {
  const db = getSupabase();
  // 1. Ghi / cập nhật kết quả của bài (1 bài = 1 dòng result).
  const { data: existing } = await db
    .from("grade_results")
    .select("id")
    .eq("job_id", jobId)
    .eq("submission_id", input.submissionId)
    .maybeSingle();
  const payload = {
    job_id: jobId,
    submission_id: input.submissionId,
    score_mcq: input.scoreMcq,
    score_essay: input.scoreEssay,
    score_total: input.scoreTotal,
    per_question: input.perQuestion,
    feedback: input.feedback,
    annotated_image_url: input.annotatedImageUrl,
    status: "ready",
    graded_at: new Date().toISOString(),
  };
  let err = null;
  if (existing) {
    const r = await db.from("grade_results").update(payload).eq("id", existing.id);
    err = r.error;
  } else {
    const r = await db.from("grade_results").insert(payload);
    err = r.error;
  }
  if (err) return { ok: false, error: err.message };

  // 2. Đánh dấu bài đã chấm xong (để trang kết quả hiện theo thứ tự graded_at).
  // Đồng thời cập nhật tên HS nếu AI đọc được tên trên bài làm.
  // Chỉ tăng completed khi bài này chưa từng được chấm xong (tránh đếm trùng
  // nếu worker nộp lại kết quả cho cùng 1 bài).
  const { data: subBefore } = await db
    .from("submissions")
    .select("status")
    .eq("id", input.submissionId)
    .single();
  const alreadyDone = subBefore?.status === "done";
  const nameUpdate =
    input.studentName && input.studentName.trim()
      ? { status: "done", student_name: input.studentName.trim() }
      : { status: "done" };
  await db.from("submissions").update(nameUpdate).eq("id", input.submissionId);

  // 3. Cập nhật tiến độ job; đủ số bài thì đóng job.
  const { data: job } = await db
    .from("grade_jobs")
    .select("total, completed")
    .eq("id", jobId)
    .single();
  const completed = ((job?.completed as number | undefined) ?? 0) + (alreadyDone ? 0 : 1);
  const total = (job?.total as number | undefined) ?? 0;
  const done = total > 0 && completed >= total;
  const { error: jobErr } = await db
    .from("grade_jobs")
    .update({
      completed,
      progress: total > 0 ? Math.round((completed / total) * 100) : 100,
      status: done ? "done" : "processing",
      finished_at: done ? new Date().toISOString() : null,
    })
    .eq("id", jobId);
  if (jobErr) return { ok: false, error: jobErr.message };
  void workerId;
  return { ok: true, jobDone: done };
}

export async function failJob(
  jobId: string,
  workerId: string,
  reason: string,
  submissionId?: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  if (submissionId) {
    await db.from("submissions").update({ status: "error" }).eq("id", submissionId);
    await db.from("grade_results").insert({
      job_id: jobId,
      submission_id: submissionId,
      score_mcq: null,
      score_essay: null,
      score_total: null,
      per_question: null,
      feedback: reason,
      annotated_image_url: null,
      status: "error",
      graded_at: new Date().toISOString(),
    });
    const { data: job } = await db
      .from("grade_jobs")
      .select("total, completed")
      .eq("id", jobId)
      .single();
    const completed = ((job?.completed as number | undefined) ?? 0) + 1;
    const total = (job?.total as number | undefined) ?? 0;
    const done = total > 0 && completed >= total;
    await db
      .from("grade_jobs")
      .update({
        completed,
        progress: total > 0 ? Math.round((completed / total) * 100) : 100,
        status: done ? "done" : "processing",
        finished_at: done ? new Date().toISOString() : null,
      })
      .eq("id", jobId);
    void workerId;
    return { ok: true };
  }
  const { error } = await db
    .from("grade_jobs")
    .update({ status: "error", finished_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) return { ok: false, error: error.message };
  void workerId;
  return { ok: true };
}

export async function logAi(entry: { workerId: string; action: string; jobId: string | null }): Promise<void> {
  // Nhật ký nhẹ: ghi vào bảng grade_jobs.stage không phù hợp nên chỉ log console
  // (giữ đơn giản cho v1; có thể tách bảng ai_logs sau).
  console.log(`[mcp] worker=${entry.workerId} action=${entry.action} job=${entry.jobId ?? "-"}`);
}
