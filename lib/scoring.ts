// Quy tắc tính điểm — port từ cham_diem_core.py của ThS. Nguyễn Văn Sang
// (dự án cham-diem-hoc-sinh, được tác giả cho phép khai thác).
//
// - P1 (trắc nghiệm ABCD): đúng × 0,25
// - P2 (Đúng/Sai): thang của Bộ theo số ý đúng trong 1 câu:
//   {0: 0, 1: 0,1, 2: 0,25, 3: 0,5, 4: 1,0}
// - P3 (trả lời ngắn): đúng × 0,5
// - P4 (tự luận): cộng điểm từng bước theo barem đã duyệt.

/** Thang điểm Bộ cho 1 câu Đúng/Sai (4 ý). */
export const P2_SCALE: Record<number, number> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0 };

export const P1_POINTS = 0.25;
export const P3_POINTS = 0.5;

export function scoreP1(correctCount: number): number {
  return round2(correctCount * P1_POINTS);
}

export function scoreP2(correctSubCount: number): number {
  return P2_SCALE[Math.max(0, Math.min(4, correctSubCount))] ?? 0;
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
