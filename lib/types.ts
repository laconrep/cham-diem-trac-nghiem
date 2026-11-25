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
