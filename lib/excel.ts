// Xuất Excel bảng điểm phiên — port từ cham_diem_core.py của ThS. Nguyễn Văn Sang
// (dự án cham-diem-hoc-sinh, được tác giả cho phép khai thác).
// 4 sheet: "Bảng Điểm Chi Tiết", "Đối Chiếu Bài Làm Chi Tiết",
// "Thống Kê Phổ Điểm", "Đáp Án & Barem Điểm Chuẩn".
// Màu sắc + font giữ nguyên thiết kế gốc (header #1F4E79, zebra #F2F5F9,
// đúng #E2EFDA, sai #FCE4D6, đáp án chuẩn #FFF2CC, Times New Roman).

import ExcelJS from "exceljs";
import type { AnswerKey, GradeResultRow, P2Mode, Submission } from "./types";
import { rankOf } from "./types";
import { computeMcqBreakdown } from "./scoring";

const FONT = "Times New Roman";
const C_HEAD = "1F4E79";
const C_HEAD2 = "2F5597";
const C_ZEBRA = "F2F5F9";
const C_HIGHLIGHT = "FFF2CC";
const C_FLAG = "FCE4D6";
const C_CORRECT = "E2EFDA";
const C_WRONG = "FCE4D6";
const C_REF = "FFF2CC";

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
function font(bold = false, color?: string, italic = false, size = 11): Partial<ExcelJS.Font> {
  return { name: FONT, size, bold, italic, color: color ? { argb: color } : undefined };
}
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "D9D9D9" } },
  left: { style: "thin", color: { argb: "D9D9D9" } },
  bottom: { style: "thin", color: { argb: "D9D9D9" } },
  right: { style: "thin", color: { argb: "D9D9D9" } },
};

export interface ExportRow {
  submission: Submission;
  result: GradeResultRow | null;
}

function pScores(result: GradeResultRow | null, p2Mode: P2Mode | undefined): { p1: number; p2: number; p3: number; p4: number } {
  if (!result?.per_question) return { p1: 0, p2: 0, p3: 0, p4: 0 };
  const mcq = computeMcqBreakdown(result.per_question.items, p2Mode);
  return { p1: mcq.p1, p2: mcq.p2, p3: mcq.p3, p4: result.score_essay ?? 0 };
}

export async function buildSessionExcel(
  sessionTitle: string,
  answerKey: AnswerKey | null,
  rows: ExportRow[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Chấm điểm trắc nghiệm + tự luận";
  wb.created = new Date();

  // ============ SHEET 1: BẢNG ĐIỂM CHI TIẾT ============
  const ws = wb.addWorksheet("Bảng Điểm Chi Tiết");
  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = `BẢNG KẾT QUẢ CHẤM ĐIỂM — ${sessionTitle}`;
  ws.getCell("A1").font = font(true, C_HEAD, false, 16);
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells("A2:K2");
  ws.getCell("A2").value = "Chấm bằng AI qua MCP · Giáo viên duyệt trước khi công bố điểm";
  ws.getCell("A2").font = font(false, undefined, true);
  ws.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 32;
  ws.getRow(2).height = 20;
  ws.getRow(4).height = 28;

  const headers = [
    "STT",
    "Họ và Tên Học Sinh",
    "Lớp",
    "Mã Đề",
    "Phần I\n(Trắc nghiệm ABCD)",
    "Phần II\n(Đúng/Sai)",
    "Phần III\n(Trả lời ngắn)",
    "Phần IV\n(Tự luận)",
    "Tổng Điểm\n(Thang 10)",
    "Xếp Loại",
    "Lỗi Sai Chi Tiết & Ghi Chú",
  ];
  headers.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = font(true, "FFFFFF");
    c.fill = fill(C_HEAD);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thinBorder;
  });

  const graded = rows.filter((r) => r.result && r.result.status === "ready");
  rows.forEach((row, idx) => {
    const r = 5 + idx;
    ws.getRow(r).height = 26;
    const res = row.result;
    const ps = pScores(res, answerKey?.p2Mode);
    const total = res?.score_total ?? null;
    const examCode = res?.per_question?.exam_code ?? "";
    const errors = res?.per_question?.errors?.join("; ") ?? "";
    const note = res?.feedback ?? "";
    const values: (string | number | null)[] = [
      idx + 1,
      row.submission.student_name,
      sessionTitle,
      examCode,
      res ? ps.p1 : null,
      res ? ps.p2 : null,
      res ? ps.p3 : null,
      res ? ps.p4 : null,
      total,
      total !== null ? rankOf(total) : "",
      [errors, note].filter(Boolean).join(". "),
    ];
    const isTop = total !== null && total >= 8;
    const isFlagged = res?.status === "error" || (res?.per_question?.items.some((i) => i.is_correct === null) ?? false);
    values.forEach((v, ci) => {
      const c = ws.getCell(r, ci + 1);
      c.value = v;
      c.font = font([2, 9, 10].includes(ci + 1), undefined);
      c.border = thinBorder;
      if (res?.status === "error") c.fill = fill(C_FLAG);
      else if (isFlagged) c.fill = fill(C_FLAG);
      else if (isTop) c.fill = fill(C_HIGHLIGHT);
      else if ((idx + 1) % 2 === 0) c.fill = fill(C_ZEBRA);
      if ([1, 3, 4, 10].includes(ci + 1)) c.alignment = { horizontal: "center", vertical: "middle" };
      else if ([5, 6, 7, 8, 9].includes(ci + 1)) {
        c.alignment = { horizontal: "right", vertical: "middle" };
        if (typeof v === "number") c.numFmt = "0.00";
      } else c.alignment = { horizontal: "left", vertical: "middle" };
    });
  });

  const sumRow = 5 + rows.length;
  ws.getRow(sumRow).height = 24;
  ws.mergeCells(`A${sumRow}:D${sumRow}`);
  const sumCell = ws.getCell(sumRow, 1);
  sumCell.value = "ĐIỂM TRUNG BÌNH";
  sumCell.font = font(true);
  sumCell.alignment = { horizontal: "center", vertical: "middle" };
  sumCell.fill = fill(C_ZEBRA);
  const avg = (f: (r: ExportRow) => number) => {
    if (graded.length === 0) return null;
    return Math.round((graded.reduce((s, r) => s + f(r), 0) / graded.length) * 100) / 100;
  };
  const avgs = [
    avg((r) => pScores(r.result, answerKey?.p2Mode).p1),
    avg((r) => pScores(r.result, answerKey?.p2Mode).p2),
    avg((r) => pScores(r.result, answerKey?.p2Mode).p3),
    avg((r) => pScores(r.result, answerKey?.p2Mode).p4),
    avg((r) => r.result?.score_total ?? 0),
  ];
  [5, 6, 7, 8, 9].forEach((col, i) => {
    const c = ws.getCell(sumRow, col);
    c.value = avgs[i];
    c.font = font(true);
    c.alignment = { horizontal: "right", vertical: "middle" };
    c.fill = fill(C_ZEBRA);
    c.border = thinBorder;
    c.numFmt = "0.00";
  });
  for (const col of [1, 2, 3, 4, 10, 11]) {
    const c = ws.getCell(sumRow, col);
    c.border = thinBorder;
    c.fill = fill(C_ZEBRA);
  }
  const colWidths = [6, 24, 18, 12, 14, 15, 15, 15, 14, 16, 75];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // ============ SHEET 2: ĐỐI CHIẾU BÀI LÀM CHI TIẾT ============
  const ws2 = wb.addWorksheet("Đối Chiếu Bài Làm Chi Tiết");
  const questions = answerKey?.questions ?? [];
  const codes = answerKey?.codes ?? [];
  // Hàng đáp án chuẩn (nền vàng) ở đầu, 1 hàng cho mỗi mã đề.
  const head2 = ["Họ và Tên", ...questions.map((q) => `Câu ${q.q}`)];
  head2.forEach((h, i) => {
    const c = ws2.getCell(1, i + 1);
    c.value = h;
    c.font = font(true, "FFFFFF");
    c.fill = fill(C_HEAD);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thinBorder;
  });
  ws2.getRow(1).height = 28;
  let r2 = 2;
  for (const code of codes) {
    ws2.getCell(r2, 1).value = `ĐÁP ÁN CHUẨN — Mã đề ${code}`;
    ws2.getCell(r2, 1).font = font(true, C_HEAD);
    ws2.getCell(r2, 1).fill = fill(C_REF);
    ws2.getCell(r2, 1).border = thinBorder;
    questions.forEach((q, qi) => {
      const c = ws2.getCell(r2, qi + 2);
      c.value = q.answers[code] ?? "";
      c.font = font(true, C_HEAD);
      c.fill = fill(C_REF);
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = thinBorder;
    });
    r2++;
  }
  // Từng học sinh: ô đúng xanh lá, ô sai cam.
  for (const row of rows) {
    const res = row.result;
    ws2.getCell(r2, 1).value = row.submission.student_name;
    ws2.getCell(r2, 1).font = font(false);
    ws2.getCell(r2, 1).border = thinBorder;
    const code = res?.per_question?.exam_code ?? codes[0] ?? "";
    questions.forEach((q, qi) => {
      const c = ws2.getCell(r2, qi + 2);
      const item = res?.per_question?.items.find((it) => it.q === q.q);
      const val = item?.student ?? "";
      c.value = val;
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = thinBorder;
      if (item) {
        c.fill = fill(item.is_correct === true ? C_CORRECT : C_WRONG);
        c.font = font(true, item.is_correct === true ? "276A3C" : "C00000");
      } else {
        c.value = res ? "" : "—";
      }
      void code;
    });
    r2++;
  }
  ws2.getColumn(1).width = 24;
  for (let i = 0; i < questions.length; i++) ws2.getColumn(i + 2).width = 10;

  // ============ SHEET 3: THỐNG KÊ PHỔ ĐIỂM ============
  const ws3 = wb.addWorksheet("Thống Kê Phổ Điểm");
  const bands: { label: string; test: (t: number) => boolean; action: string }[] = [
    { label: "Xuất sắc (≥ 9)", test: (t) => t >= 9, action: "Khen thưởng, giao bài nâng cao" },
    { label: "Giỏi (8 – <9)", test: (t) => t >= 8 && t < 9, action: "Củng cố, mở rộng" },
    { label: "Khá (6,5 – <8)", test: (t) => t >= 6.5 && t < 8, action: "Ôn lại phần còn sai" },
    { label: "Trung bình (5 – <6,5)", test: (t) => t >= 5 && t < 6.5, action: "Phụ đạo, làm lại dạng bài sai" },
    { label: "Yếu (< 5)", test: (t) => t < 5, action: "Kèm riêng, kiểm tra lại" },
  ];
  ["Phổ điểm", "Số học sinh", "Tỉ lệ (%)", "Hành động gợi ý"].forEach((h, i) => {
    const c = ws3.getCell(1, i + 1);
    c.value = h;
    c.font = font(true, "FFFFFF");
    c.fill = fill(C_HEAD);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder;
  });
  bands.forEach((b, i) => {
    const count = graded.filter((r) => b.test(r.result?.score_total ?? -1)).length;
    const pct = graded.length > 0 ? Math.round((count / graded.length) * 1000) / 10 : 0;
    const vals: (string | number)[] = [b.label, count, pct, b.action];
    vals.forEach((v, ci) => {
      const c = ws3.getCell(i + 2, ci + 1);
      c.value = v;
      c.font = font(ci === 0);
      c.border = thinBorder;
      if (ci === 2) c.numFmt = "0.0";
      c.alignment = { horizontal: ci === 3 ? "left" : "center", vertical: "middle" };
    });
    if (count > 0) ws3.getCell(i + 2, 1).fill = fill(C_HIGHLIGHT);
  });
  ws3.getColumn(1).width = 24;
  ws3.getColumn(2).width = 14;
  ws3.getColumn(3).width = 12;
  ws3.getColumn(4).width = 50;

  // ============ SHEET 4: ĐÁP ÁN & BAREM ĐIỂM CHUẨN ============
  const ws4 = wb.addWorksheet("Đáp Án & Barem Điểm Chuẩn");
  ["Câu", "Phần", "Điểm", ...codes.map((c) => `Mã đề ${c}`)].forEach((h, i) => {
    const c = ws4.getCell(1, i + 1);
    c.value = h;
    c.font = font(true, "FFFFFF");
    c.fill = fill(C_HEAD);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder;
  });
  questions.forEach((q, i) => {
    const vals: (string | number)[] = [
      q.q,
      q.part,
      q.points,
      ...codes.map((c) => q.answers[c] ?? ""),
    ];
    vals.forEach((v, ci) => {
      const c = ws4.getCell(i + 2, ci + 1);
      c.value = v;
      c.font = font(false);
      c.border = thinBorder;
      c.alignment = { horizontal: "center", vertical: "middle" };
      if ((i + 1) % 2 === 0) c.fill = fill(C_ZEBRA);
    });
  });
  let r4 = 2 + questions.length + 1;
  ws4.getCell(r4, 1).value = "Barem tự luận:";
  ws4.getCell(r4, 1).font = font(true, C_HEAD);
  r4++;
  for (const s of answerKey?.essayBarem ?? []) {
    ws4.getCell(r4, 1).value = s.content;
    ws4.getCell(r4, 2).value = s.points;
    ws4.getCell(r4, 2).numFmt = "0.00";
    r4++;
  }
  ws4.getCell(r4, 1).value =
    "Nguồn: thiết kế Excel tham khảo dự án cham-diem-hoc-sinh của ThS. Nguyễn Văn Sang (được tác giả cho phép khai thác).";
  ws4.getCell(r4, 1).font = font(false, undefined, true);
  ws4.getColumn(1).width = 10;
  ws4.getColumn(2).width = 10;
  ws4.getColumn(3).width = 10;
  codes.forEach((_, i) => ws4.getColumn(4 + i).width = 12);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
