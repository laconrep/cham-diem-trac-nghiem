// Kiểu dữ liệu chung của app chấm điểm trắc nghiệm + tự luận.

export type QuestionPart = "P1" | "P2" | "P3" | "P4";

export interface AnswerQuestion {
  /** Nhãn câu: "1", "13a", "15"... */
  q: string;
  part: QuestionPart;
  /** Đáp án đúng theo mã đề: { "101": "A", "102": "B" } */
  answers: Record<string, string>;
  /** Điểm khi làm đúng hoàn toàn câu này (P1 0,25 · P3 0,5 · P2 tính theo thang Bộ). */
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
