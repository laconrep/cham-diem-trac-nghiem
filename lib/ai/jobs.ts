// Hàm nghiệp vụ cho cổng MCP — mọi thao tác DB đi qua đây, route chỉ làm
// JSON-RPC plumbing (theo mẫu lib/ai/jobs.ts của EduSync).
import { getSupabase } from "../supabase";
import { computeMcqBreakdown, normalizeEssaySteps, round2 } from "../scoring";
import {
  GRADE_MODE_LABEL,
  REGRADE_STAGE_PREFIX,
  jobModeOf,
  stageLabel,
  type AnswerKey,
  type GradeJobRow,
  type GradeMode,
  type P2Mode,
  type PerQuestionResult,
  type SessionRow,
} from "../types";

export interface JobSummary {
  id: string;
  session_id: string;
  session_title: string;
  status: string;
  total: number;
  completed: number;
  created_at: string;
  /** Chế độ chấm: full = cả bài, essay = chỉ tự luận, mcq = chỉ trắc nghiệm. */
  mode: GradeMode;
}

export async function listPendingJobs(workerId: string, limit = 20): Promise<JobSummary[]> {
  const db = getSupabase();
  // Cột mode chỉ có sau migration 005: thử select kèm mode, lỗi thì select lại
  // không có mode (chế độ khi đó đọc từ tiền tố stage).
  let rows: Array<Record<string, unknown>> | null = null;
  const withMode = await db
    .from("cdtn_grade_jobs")
    .select("id, session_id, status, total, completed, created_at, stage, mode, sessions(title)")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!withMode.error) {
    rows = (withMode.data ?? []) as Array<Record<string, unknown>>;
  } else {
    const plain = await db
      .from("cdtn_grade_jobs")
      .select("id, session_id, status, total, completed, created_at, stage, sessions(title)")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (plain.error) throw new Error(plain.error.message);
    rows = (plain.data ?? []) as Array<Record<string, unknown>>;
  }
  void workerId;
  return rows.map((j) => ({
    id: j.id as string,
    session_id: j.session_id as string,
    session_title: ((j.sessions as unknown as { title?: string } | null)?.title ?? "") as string,
    status: j.status as string,
    total: j.total as number,
    completed: j.completed as number,
    created_at: j.created_at as string,
    mode: jobModeOf({ mode: (j.mode as string | null) ?? null, stage: (j.stage as string | null) ?? null }),
  }));
}

/** Nhãn stage khởi tạo theo chế độ chấm. */
export function stageForMode(mode: GradeMode): string {
  return mode === "full" ? "" : GRADE_MODE_LABEL[mode];
}

/**
 * Tạo job chấm mới. Ưu tiên ghi cột mode (migration 005); nếu cột chưa có
 * (chưa chạy migration) thì mã hoá chế độ vào tiền tố stage để code vẫn
 * chạy được — jobModeOf() đọc được cả hai cách.
 */
export async function insertGradeJob(
  db: ReturnType<typeof getSupabase>,
  sessionId: string,
  total: number,
  mode: GradeMode
): Promise<string> {
  const base = { session_id: sessionId, status: "queued", total, completed: 0, progress: 0 };
  if (mode !== "full") {
    const label = stageForMode(mode);
    const withMode = await db
      .from("cdtn_grade_jobs")
      .insert({ ...base, mode, stage: label })
      .select("id")
      .single();
    if (!withMode.error && withMode.data) return withMode.data.id as string;
    const fallback = await db
      .from("cdtn_grade_jobs")
      .insert({ ...base, stage: `${REGRADE_STAGE_PREFIX}${mode}|${label}` })
      .select("id")
      .single();
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data.id as string;
  }
  const { data, error } = await db.from("cdtn_grade_jobs").insert(base).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Claim nguyên tử: chỉ 1 worker nhận được job đang queued. */
export async function claimJob(jobId: string, workerId: string): Promise<GradeJobRow | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("cdtn_grade_jobs")
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
  const { data: job, error } = await db.from("cdtn_grade_jobs").select("*").eq("id", jobId).single();
  if (error || !job) return null;
  const { data: session } = await db
    .from("cdtn_sessions")
    .select("id, title, answer_key, criteria")
    .eq("id", job.session_id)
    .single();
  const { data: submissions } = await db
    .from("cdtn_submissions")
    .select("id, student_name, files, status, created_at")
    .eq("job_id", jobId)
    .in("status", ["queued", "grading", "error"])
    .order("created_at", { ascending: true });
  const subs = (submissions ?? []) as unknown as Array<{
    id: string;
    student_name: string;
    files: Array<{ name: string; url: string; kind: string }>;
    status: string;
    created_at: string;
  }>;
  // Job chấm lại (mode essay/mcq): kèm kết quả cũ của từng bài để worker biết
  // mã đề + phần điểm được giữ nguyên (chỉ phần chấm lại mới bị ghi đè).
  const mode = jobModeOf(job as { mode?: string | null; stage?: string | null });
  let existingResults: Record<string, unknown> = {};
  if (mode !== "full" && subs.length > 0) {
    const { data: oldResults } = await db
      .from("cdtn_grade_results")
      .select("submission_id, score_mcq, score_essay, score_total, per_question, feedback, annotated_image_url, annotated_essay_image_url, status, approved, graded_at")
      .in(
        "submission_id",
        subs.map((s) => s.id)
      )
      .order("graded_at", { ascending: true });
    for (const r of oldResults ?? []) {
      existingResults[r.submission_id as string] = r as Record<string, unknown>;
    }
  }
  return {
    job: { ...(job as unknown as GradeJobRow), mode },
    session: session as unknown as SessionRow | null,
    submissions: subs,
    existing_results: existingResults,
  };
}

export async function setJobProgress(
  jobId: string,
  workerId: string,
  progress: number,
  stage?: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  // Giữ tiền tố mã hoá chế độ chấm lại (khi chưa có cột mode) để submit_result
  // vẫn đọc được chế độ sau nhiều lần cập nhật tiến độ.
  const { data: cur } = await db.from("cdtn_grade_jobs").select("stage").eq("id", jobId).single();
  const curStage = (cur?.stage as string | null) ?? "";
  let nextStage: string | null = stage ?? null;
  if (curStage.startsWith(REGRADE_STAGE_PREFIX)) {
    const modePart = curStage.slice(REGRADE_STAGE_PREFIX.length).split("|")[0];
    const display = stage ?? stageLabel(curStage);
    nextStage = `${REGRADE_STAGE_PREFIX}${modePart}|${display}`;
  }
  const { error } = await db
    .from("cdtn_grade_jobs")
    .update({ progress: Math.max(0, Math.min(100, progress)), stage: nextStage })
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
  const { error } = await db.from("cdtn_submissions").update({ status }).eq("id", submissionId);
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
  /** URL ảnh tự luận đã chấm (khung ghi chú từng bước barem, phương án A — migration 002). */
  annotatedEssayImageUrl: string | null;
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
  // Chế độ chấm của job: full = chấm cả bài; essay = chỉ chấm lại tự luận
  // (giữ nguyên điểm + chi tiết trắc nghiệm cũ); mcq = chỉ chấm lại trắc
  // nghiệm (giữ nguyên tự luận cũ). Chấm lại thì SỬA điểm trên đúng dòng
  // kết quả cũ của bài và đưa về trạng thái chờ duyệt lại (approved=false).
  const { data: jobRow } = await db.from("cdtn_grade_jobs").select("*").eq("id", jobId).single();
  const mode = jobModeOf((jobRow ?? {}) as { mode?: string | null; stage?: string | null });
  const sessionId = jobRow?.session_id as string | undefined;

  // Kết quả cũ của bài (mới nhất theo graded_at) — nguồn của phần được giữ nguyên khi chấm lại từng phần.
  const { data: existing } = await db
    .from("cdtn_grade_results")
    .select("*")
    .eq("submission_id", input.submissionId)
    .order("graded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const oldPerQuestion = (existing?.per_question ?? null) as PerQuestionResult | null;

  let perQuestion = input.perQuestion;
  let scoreEssay = input.scoreEssay;
  let scoreMcq = input.scoreMcq;
  let mcqRecomputed = false;
  // Điểm trắc nghiệm: app tự tính lại từ kết quả từng câu theo chế độ của
  // phiên (P2 mặc định 0,25đ/ý; phiên bật "chấm theo mẫu bộ" thì theo thang
  // Bộ) — tránh agent chấm áp sai thang điểm Đúng/Sai. Chỉ tính lại khi
  // agent gửi đủ kết quả từng câu; thiếu thì giữ điểm agent gửi.
  // Job chỉ chấm lại tự luận thì KHÔNG đụng phần trắc nghiệm.
  if (mode !== "essay" && perQuestion?.items?.length) {
    let p2Mode: P2Mode | undefined;
    if (sessionId) {
      const { data: sess } = await db
        .from("cdtn_sessions")
        .select("answer_key")
        .eq("id", sessionId)
        .single();
      p2Mode = (sess?.answer_key as AnswerKey | null)?.p2Mode;
    }
    scoreMcq = computeMcqBreakdown(perQuestion.items, p2Mode).total;
    mcqRecomputed = true;
  }
  // Thang điểm tự luận nhỏ nhất là 0,25đ (bác chốt 20/11): chuẩn hoá điểm
  // từng bước về bội số 0,25 gần nhất, rồi tính lại điểm tự luận + tổng
  // điểm từ các bước đã chuẩn hoá (tránh agent gửi 0,125đ như bài Cẩm Diên
  // bước b6 phiên "10"). Job chỉ chấm lại trắc nghiệm thì KHÔNG đụng tự luận.
  let scoreTotal = input.scoreTotal;
  if (mode !== "mcq" && perQuestion?.essay_steps?.length) {
    const norm = normalizeEssaySteps(perQuestion.essay_steps);
    perQuestion = { ...perQuestion, essay_steps: norm.steps };
    scoreEssay = norm.total;
    scoreTotal = round2(scoreMcq + norm.total);
  } else if (mcqRecomputed) {
    scoreTotal = round2(scoreMcq + scoreEssay);
  }

  // Gộp phần được giữ nguyên khi chấm lại từng phần.
  let feedback = input.feedback;
  let annotatedImageUrl = input.annotatedImageUrl;
  let annotatedEssayImageUrl = input.annotatedEssayImageUrl;
  if (mode === "essay") {
    scoreMcq = (existing?.score_mcq as number | null) ?? 0;
    perQuestion = {
      exam_code: perQuestion?.exam_code ?? oldPerQuestion?.exam_code ?? null,
      items: oldPerQuestion?.items ?? [],
      essay_steps: perQuestion?.essay_steps ?? [],
      errors: perQuestion?.errors ?? oldPerQuestion?.errors ?? [],
      note: perQuestion?.note ?? oldPerQuestion?.note ?? "",
    };
    annotatedImageUrl = (existing?.annotated_image_url as string | null) ?? null;
    annotatedEssayImageUrl = annotatedEssayImageUrl ?? ((existing?.annotated_essay_image_url as string | null) ?? null);
    if (!feedback) feedback = (existing?.feedback as string | null) ?? "";
    scoreTotal = round2(scoreMcq + scoreEssay);
  } else if (mode === "mcq") {
    scoreEssay = (existing?.score_essay as number | null) ?? 0;
    perQuestion = {
      exam_code: perQuestion?.exam_code ?? oldPerQuestion?.exam_code ?? null,
      items: perQuestion?.items ?? [],
      essay_steps: oldPerQuestion?.essay_steps ?? [],
      errors: perQuestion?.errors ?? oldPerQuestion?.errors ?? [],
      note: perQuestion?.note ?? oldPerQuestion?.note ?? "",
    };
    annotatedEssayImageUrl = (existing?.annotated_essay_image_url as string | null) ?? null;
    annotatedImageUrl = annotatedImageUrl ?? ((existing?.annotated_image_url as string | null) ?? null);
    if (!feedback) feedback = (existing?.feedback as string | null) ?? "";
    scoreTotal = round2(scoreMcq + scoreEssay);
  }

  // 1. Ghi / cập nhật kết quả của bài (1 bài = 1 dòng result; chấm lại thì
  // sửa đúng dòng cũ, không tạo dòng trùng). Chấm lại xong đưa về chờ duyệt.
  const payload = {
    job_id: jobId,
    submission_id: input.submissionId,
    score_mcq: scoreMcq,
    score_essay: scoreEssay,
    score_total: scoreTotal,
    per_question: perQuestion,
    feedback,
    annotated_image_url: annotatedImageUrl,
    annotated_essay_image_url: annotatedEssayImageUrl,
    status: "ready",
    approved: false,
    graded_at: new Date().toISOString(),
  };
  let err = null;
  if (existing) {
    const r = await db.from("cdtn_grade_results").update(payload).eq("id", existing.id);
    err = r.error;
  } else {
    const r = await db.from("cdtn_grade_results").insert(payload);
    err = r.error;
  }
  if (err) return { ok: false, error: err.message };

  // 2. Đánh dấu bài đã chấm xong (để trang kết quả hiện theo thứ tự graded_at).
  // Đồng thời cập nhật tên HS nếu AI đọc được tên trên bài làm.
  // Chỉ tăng completed khi bài này chưa từng được chấm xong (tránh đếm trùng
  // nếu worker nộp lại kết quả cho cùng 1 bài).
  const { data: subBefore } = await db
    .from("cdtn_submissions")
    .select("status")
    .eq("id", input.submissionId)
    .single();
  const alreadyDone = subBefore?.status === "done";
  const nameUpdate =
    input.studentName && input.studentName.trim()
      ? { status: "done", student_name: input.studentName.trim() }
      : { status: "done" };
  await db.from("cdtn_submissions").update(nameUpdate).eq("id", input.submissionId);

  // 3. Cập nhật tiến độ job; đủ số bài thì đóng job.
  const { data: job } = await db
    .from("cdtn_grade_jobs")
    .select("total, completed")
    .eq("id", jobId)
    .single();
  const completed = ((job?.completed as number | undefined) ?? 0) + (alreadyDone ? 0 : 1);
  const total = (job?.total as number | undefined) ?? 0;
  const done = total > 0 && completed >= total;
  const { error: jobErr } = await db
    .from("cdtn_grade_jobs")
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
    await db.from("cdtn_submissions").update({ status: "error" }).eq("id", submissionId);
    // Job chấm lại từng phần mà lỗi 1 bài: giữ nguyên kết quả cũ (không ghi
    // dòng lỗi đè lên điểm cũ); chỉ ghi dòng lỗi khi bài chưa từng có kết quả.
    const { data: jobRow } = await db.from("cdtn_grade_jobs").select("*").eq("id", jobId).single();
    const mode = jobModeOf((jobRow ?? {}) as { mode?: string | null; stage?: string | null });
    const { data: existing } = await db
      .from("cdtn_grade_results")
      .select("id")
      .eq("submission_id", submissionId)
      .limit(1)
      .maybeSingle();
    if (!(mode !== "full" && existing)) {
      await db.from("cdtn_grade_results").insert({
        job_id: jobId,
        submission_id: submissionId,
        score_mcq: null,
        score_essay: null,
        score_total: null,
        per_question: null,
        feedback: reason,
        annotated_image_url: null,
        annotated_essay_image_url: null,
        status: "error",
        graded_at: new Date().toISOString(),
      });
    }
    const { data: job } = await db
      .from("cdtn_grade_jobs")
      .select("total, completed")
      .eq("id", jobId)
      .single();
    const completed = ((job?.completed as number | undefined) ?? 0) + 1;
    const total = (job?.total as number | undefined) ?? 0;
    const done = total > 0 && completed >= total;
    await db
      .from("cdtn_grade_jobs")
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
    .from("cdtn_grade_jobs")
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
