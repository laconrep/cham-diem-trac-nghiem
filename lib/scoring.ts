// Quy tắc tính điểm — port từ cham_diem_core.py của ThS. Nguyễn Văn Sang
// (dự án cham-diem-hoc-sinh, được tác giả cho phép khai thác).
//
// - P1 (trắc nghiệm ABCD): đúng × 0,25
// - P2 (Đúng/Sai): mặc định mỗi ý đúng được điểm của ý đó (thường 0,25đ/ý);
//   khi phiên bật "chấm theo mẫu bộ" thì dùng thang Bộ theo số ý đúng
//   trong 1 câu: {0: 0, 1: 0,1, 2: 0,25, 3: 0,5, 4: 1,0}
// - P3 (trả lời ngắn): đúng × 0,5
// - P4 (tự luận): cộng điểm từng bước theo barem đã duyệt.

import type { P2Mode, PerQuestionItem } from "./types";

/** Thang điểm Bộ cho 1 câu Đúng/Sai (4 ý). */
export const P2_SCALE: Record<number, number> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0 };

export const P1_POINTS = 0.25;
export const P3_POINTS = 0.5;
/** Điểm mặc định mỗi ý Đúng/Sai khi không chấm theo mẫu bộ. */
export const P2_PER_ITEM = 0.25;

/** Bước điểm nhỏ nhất của tự luận: 0,25đ (bác chốt 20/11/2026).
 *  Điểm mỗi bước barem CHỈ được là bội số của 0,25 (0 / 0,25 / 0,5 / …)
 *  và không vượt điểm tối đa của bước — bước 0,25đ chỉ được 0 hoặc 0,25
 *  (không cho nửa bước 0,125đ); bước 0,5đ chỉ được 0 / 0,25 / 0,5. */
export const ESSAY_STEP = 0.25;

/** Làm tròn điểm 1 bước tự luận về bội số 0,25 gần nhất, kẹp trong
 *  [0, điểm tối đa của bước]. VD: 0,125 → 0,25; 0,375 → 0,5; 0,1 → 0. */
export function snapEssayStep(awarded: number, maxPoints: number): number {
  const snapped = Math.round(awarded * 4) / 4;
  return round2(Math.max(0, Math.min(maxPoints, snapped)));
}

/** Chuẩn hoá điểm từng bước tự luận về thang 0,25đ + tổng điểm tự luận. */
export function normalizeEssaySteps(
  steps: Array<{ step: string; points: number; awarded: number; note?: string }>
): { steps: Array<{ step: string; points: number; awarded: number; note?: string }>; total: number } {
  const norm = steps.map((s) => ({ ...s, awarded: snapEssayStep(s.awarded, s.points) }));
  return { steps: norm, total: round2(norm.reduce((sum, s) => sum + s.awarded, 0)) };
}

export function scoreP1(correctCount: number): number {
  return round2(correctCount * P1_POINTS);
}

export function scoreP2(correctSubCount: number): number {
  return P2_SCALE[Math.max(0, Math.min(4, correctSubCount))] ?? 0;
}

/** Điểm Đúng/Sai theo cách mặc định: mỗi ý đúng được P2_PER_ITEM (0,25đ). */
export function scoreP2PerItem(correctCount: number): number {
  return round2(Math.max(0, correctCount) * P2_PER_ITEM);
}

/** Điểm 1 câu Đúng/Sai (4 ý) theo chế độ của phiên; vắng mặt = "perItem". */
export function scoreP2WithMode(correctCount: number, mode: P2Mode | undefined): number {
  return mode === "bo" ? scoreP2(correctCount) : scoreP2PerItem(correctCount);
}

export interface McqBreakdown {
  p1: number;
  p2: number;
  p3: number;
  total: number;
}

/**
 * Tính điểm trắc nghiệm (P1+P2+P3) từ kết quả từng câu — app tự tính lại
 * để điểm hiển thị và bảng xuất Excel luôn khớp nhau, bất kể agent chấm
 * gửi số nào. P2: "perItem" = cộng điểm từng ý đúng (theo points của ý,
 * mặc định 0,25); "bo" = thang Bộ theo số ý đúng của từng câu.
 */
export function computeMcqBreakdown(items: PerQuestionItem[], p2Mode: P2Mode | undefined): McqBreakdown {
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  const p2CorrectByQuestion: Record<string, number> = {};
  for (const it of items) {
    if (it.part === "P1") {
      if (it.is_correct === true) p1 += it.points;
    } else if (it.part === "P3") {
      if (it.is_correct === true) p3 += it.points;
    } else if (it.part === "P2") {
      if (p2Mode === "bo") {
        if (it.is_correct === true) {
          const base = it.q.replace(/[a-d]$/i, "");
          p2CorrectByQuestion[base] = (p2CorrectByQuestion[base] ?? 0) + 1;
        }
      } else if (it.is_correct === true) {
        p2 += it.points;
      }
    }
  }
  if (p2Mode === "bo") {
    for (const c of Object.values(p2CorrectByQuestion)) p2 += scoreP2(c);
  }
  return { p1: round2(p1), p2: round2(p2), p3: round2(p3), total: round2(p1 + p2 + p3) };
}

export function scoreP3(correctCount: number): number {
  return round2(correctCount * P3_POINTS);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Chuẩn hoá đáp án để đối chiếu: bỏ khoảng trắng, viết hoa. */
export function normAnswer(v: string | null | undefined): string {
  return (v ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Hai đáp án có khớp nhau không (chấp nhận "A" = "A", "Đ" = "Đ", "12" = "12"). */
export function answersMatch(student: string | null | undefined, correct: string | null | undefined): boolean {
  const s = normAnswer(student);
  const c = normAnswer(correct);
  if (!s || !c) return false;
  return s === c;
}
