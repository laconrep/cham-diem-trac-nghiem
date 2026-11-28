// Kiểu dữ liệu chung của app chấm điểm trắc nghiệm + tự luận.

export type QuestionPart = "P1" | "P2" | "P3" | "P4";

/** Cách tính điểm Phần II (Đúng/Sai):
 *  - "perItem" (mặc định): mỗi ý đúng được điểm của ý đó (thường 0,25đ/ý).
 *  - "bo": thang Bộ theo số ý đúng trong 1 câu (0–0,1–0,25–0,5–1,0). */
export type P2Mode = "perItem" | "bo";

export interface AnswerQuestion {
  /** Nhãn câu: "1", "13a", "15"... */
  q: string;
  part: QuestionPart;
  /** Đáp án đúng theo mã đề: { "101": "A", "102": "B" } */
  answers: Record<string, string>;
  /** Điểm khi làm đúng hoàn toàn câu này (P1 0,25 · P3 0,5 · P2 theo p2Mode của phiên). */
  points: number;
}

export interface EssayBaremStep {
  id: string;
  content: string;
  points: number;
}

export interface AnswerKey {
  codes: string[];
  questions: AnswerQuestion[];
  essayBarem: EssayBaremStep[];
  /** Cách tính điểm Đúng/Sai của phiên; vắng mặt = "perItem" (mặc định 0,25đ/ý). */
  p2Mode?: P2Mode;
}

export interface CriteriaRow extends AnswerQuestion {}

export interface SubmissionFile {
  name: string;
  url: string;
  kind: "image" | "pdf";
  mime?: string;
}

export type SubmissionStatus = "queued" | "grading" | "done" | "error";

export interface Submission {
  id: string;
  session_id: string;
  student_name: string;
  files: SubmissionFile[];
  status: SubmissionStatus;
  job_id: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  title: string;
  answer_key: AnswerKey | null;
  criteria: AnswerKey | null;
  status: string;
  /** Tài khoản giáo viên tạo phiên (migration 003) — null với phiên cũ chưa gán chủ. */
  owner_id: string | null;
  created_at: string;
}

export interface PerQuestionItem {
  q: string;
  part: QuestionPart;
  student: string | null;
  correct: string;
  is_correct: boolean | null; // null = không xác định (tô 2 ô / mờ)
  points: number;
}

export interface EssayStepResult {
  step: string;
  points: number;
  awarded: number;
  note?: string;
}

export interface PerQuestionResult {
  exam_code: string | null;
  items: PerQuestionItem[];
  essay_steps: EssayStepResult[];
  errors: string[];
  note: string;
}

export interface GradeResultRow {
  id: string;
  job_id: string;
  submission_id: string;
  score_mcq: number | null;
  score_essay: number | null;
  score_total: number | null;
  per_question: PerQuestionResult | null;
  feedback: string | null;
  annotated_image_url: string | null;
  /** URL ảnh tự luận đã chấm (khung ghi chú từng bước barem, phương án A — migration 002). */
  annotated_essay_image_url: string | null;
  status: string;
  approved: boolean;
  graded_at: string | null;
}

export interface GradeJobRow {
  id: string;
  session_id: string;
  status: string;
  total: number;
  completed: number;
  progress: number;
  stage: string | null;
  worker_id: string | null;
  created_at: string;
  finished_at: string | null;
  /** Chế độ chấm của job (migration 005): "full" chấm cả bài (mặc định),
   *  "essay" chỉ chấm lại tự luận, "mcq" chỉ chấm lại trắc nghiệm.
   *  Vắng mặt khi chưa chạy migration 005 — lúc đó chế độ được mã hoá ở
   *  tiền tố của stage ("regrade:essay|..."), xem jobModeOf(). */
  mode?: GradeMode | null;
}

/** Chế độ chấm của 1 job: full = chấm cả bài, essay = chỉ tự luận, mcq = chỉ trắc nghiệm. */
export type GradeMode = "full" | "essay" | "mcq";

export const GRADE_MODE_LABEL: Record<GradeMode, string> = {
  full: "Chấm lại cả hai phần",
  essay: "Chấm lại tự luận",
  mcq: "Chấm lại trắc nghiệm",
};

/** Tiền tố stage dùng để mã hoá chế độ chấm lại khi chưa có cột mode (migration 005). */
export const REGRADE_STAGE_PREFIX = "regrade:";

/** Đọc chế độ chấm của job: tiền tố stage (ghi lúc tạo job) thắng cột mode.
 *  Lý do: migration thêm cột mode với default 'full' sẽ backfill 'full' cho
 *  job chấm lại đang chạy dở — nếu đọc cột trước, job đó bị hiểu nhầm là
 *  chấm cả bài và ghi đè mất phần không chấm lại (sự cố 28/11). */
export function jobModeOf(job: { mode?: string | null; stage?: string | null }): GradeMode {
  const stage = job.stage ?? "";
  if (stage.startsWith(REGRADE_STAGE_PREFIX)) {
    const m = stage.slice(REGRADE_STAGE_PREFIX.length).split("|")[0];
    if (m === "essay" || m === "mcq") return m;
  }
  if (job.mode === "essay" || job.mode === "mcq" || job.mode === "full") return job.mode;
  return "full";
}

/** Nhãn stage hiển thị cho GV: bỏ tiền tố mã hoá chế độ (nếu có). */
export function stageLabel(stage: string | null | undefined): string {
  const s = stage ?? "";
  if (s.startsWith(REGRADE_STAGE_PREFIX)) {
    const idx = s.indexOf("|");
    return idx >= 0 ? s.slice(idx + 1) : "";
  }
  return s;
}

/** Job tách ý + dựng barem tự luận bằng AI (migration 004). */
export type BaremJobStatus = "queued" | "processing" | "done" | "error";

export interface BaremJobRow {
  id: string;
  owner_id: string | null;
  raw_text: string;
  machine_barem: EssayBaremStep[];
  status: BaremJobStatus;
  worker_id: string | null;
  result_barem: EssayBaremStep[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  done_at: string | null;
}

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  queued: "Đang chờ chấm",
  grading: "Đang chấm",
  done: "Đã chấm xong",
  error: "Lỗi",
};

export const SUBMISSION_STATUS_CLASS: Record<SubmissionStatus, string> = {
  queued: "bg-slate-100 text-slate-700",
  grading: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
};

/** Xếp loại theo thang của repo tham khảo (cham_diem_core.py). */
export function rankOf(total: number): string {
  if (total >= 9) return "Xuất sắc";
  if (total >= 8) return "Giỏi";
  if (total >= 6.5) return "Khá";
  if (total >= 5) return "Trung bình";
  return "Yếu";
}
