// Đọc bảng đáp án trong file Word (.docx) bằng mammoth.
//
// Định dạng bảng kỳ vọng (cột = mã đề, dòng = câu hỏi):
//   | Câu | 101 | 102 | ...
//   | 1   | A   | B   |
//   | 2   | C   | D   |
//   | 13a | Đ   | S   |   <- ý Đúng/Sai (nhãn câu có chữ cái)
//   | 15  | 12  | 7   |   <- trả lời ngắn (đáp án là số/chữ)
//
// mammoth chuyển .docx thành HTML (bảng Word -> <table>); ở đây tách các
// <table> ra rồi đọc từng ô. Trả về AnswerKey + cảnh báo để GV kiểm tra
// trước khi duyệt tiêu chí chấm.

import mammoth from "mammoth";
import type { AnswerKey, AnswerQuestion, EssayBaremStep, QuestionPart } from "./types";
import { P1_POINTS, P3_POINTS } from "./scoring";

export interface ParseWarning {
  row: number;
  message: string;
}

export interface ParseResult {
  answerKey: AnswerKey;
  warnings: ParseWarning[];
  tablesFound: number;
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Tách các bảng <table> trong HTML mammoth trả về -> mảng các dòng, mỗi dòng là mảng ô. */
function extractTables(html: string): string[][][] {
  const tables: string[][][] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(html)) !== null) {
    const rows: string[][] = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(m[0])) !== null) {
      const cells: string[] = [];
      const cellRe = /<(td|th)[\s\S]*?<\/\1>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[0])) !== null) {
        cells.push(stripTags(cm[0]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

function isQuestionLabel(cell: string): boolean {
  // "1", "13a", "13A", "15" ... (số, có thể kèm 1 chữ cái cho ý Đúng/Sai)
  return /^\d{1,3}[a-dA-D]?$/.test(cell.trim());
}

function isCodeCell(cell: string): boolean {
  // Mã đề thường là số 2-4 chữ số ("101", "485") hoặc chữ+số ("A1")
  return /^[A-Za-z0-9]{2,6}$/.test(cell.trim()) && !/^câu$/i.test(cell.trim());
}

function partOf(label: string, answer: string): QuestionPart {
  if (/^\d+[a-dA-D]$/.test(label.trim())) return "P2";
  const a = answer.trim();
  // Đáp án là số (hoặc số/chữ ngắn không phải A-D/Đ-S) -> trả lời ngắn
  if (/^-?\d+([.,]\d+)?$/.test(a)) return "P3";
  return "P1";
}

export function parseAnswerTableRows(rows: string[][]): ParseResult {
  const warnings: ParseWarning[] = [];
  if (rows.length < 2) {
    return {
      answerKey: { codes: [], questions: [], essayBarem: [] },
      warnings: [{ row: 0, message: "Bảng đáp án cần ít nhất 2 dòng (dòng tiêu đề + 1 câu hỏi)." }],
      tablesFound: 0,
    };
  }

  // Tìm dòng tiêu đề: dòng đầu tiên có ô đầu là "Câu" (hoặc trống) và các ô sau là mã đề.
  let headerIdx = -1;
  let codes: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    const first = (row[0] ?? "").trim();
    if (/^câu$/i.test(first) || first === "") {
      const rest = row.slice(1).map((c) => c.trim()).filter(Boolean);
      if (rest.length >= 1 && rest.every(isCodeCell)) {
        headerIdx = i;
        codes = rest;
        break;
      }
    }
  }
  if (headerIdx === -1) {
    return {
      answerKey: { codes: [], questions: [], essayBarem: [] },
      warnings: [
        {
          row: 0,
          message:
            "Không tìm thấy dòng tiêu đề mã đề. Dòng đầu bảng phải là: ô đầu ghi “Câu”, các ô tiếp theo là mã đề (vd 101, 102).",
        },
      ],
      tablesFound: 1,
    };
  }

  // Trùng mã đề?
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dupes.length > 0) {
    warnings.push({ row: headerIdx + 1, message: `Mã đề trùng nhau: ${[...new Set(dupes)].join(", ")}.` });
  }

  const questions: AnswerQuestion[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const label = (row[0] ?? "").trim();
    if (!label) continue;
    if (/^phần/i.test(label)) continue; // dòng phân mục "Phần I", "Phần II"...
    if (!isQuestionLabel(label)) {
      warnings.push({ row: i + 1, message: `Dòng ${i + 1}: nhãn câu “${label}” không nhận dạng được (mong đợi dạng 1, 2, 13a...). Dòng này bị bỏ qua.` });
      continue;
    }
    const answers: Record<string, string> = {};
    let firstAnswer = "";
    codes.forEach((code, ci) => {
      const val = (row[ci + 1] ?? "").trim();
      if (val) {
        answers[code] = val;
        if (!firstAnswer) firstAnswer = val;
      }
    });
    if (Object.keys(answers).length === 0) {
      warnings.push({ row: i + 1, message: `Câu ${label}: chưa có đáp án cho mã đề nào (ô trống).` });
    }
    const missing = codes.filter((c) => !answers[c]);
    if (missing.length > 0 && Object.keys(answers).length > 0) {
      warnings.push({ row: i + 1, message: `Câu ${label}: thiếu đáp án cho mã đề ${missing.join(", ")}.` });
    }
    const part = partOf(label, firstAnswer);
    questions.push({
      q: label.toLowerCase(),
      part,
      answers,
      points: part === "P3" ? P3_POINTS : P1_POINTS,
    });
  }

  if (questions.length === 0) {
    warnings.push({ row: 0, message: "Bảng không có câu hỏi nào đọc được." });
  }

  return { answerKey: { codes, questions, essayBarem: [] }, warnings, tablesFound: 1 };
}

/** Đọc file .docx (Buffer) -> AnswerKey + cảnh báo. Lấy bảng đầu tiên đọc được. */
export async function parseAnswerDocx(buffer: Buffer): Promise<ParseResult> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const tables = extractTables(html);
  if (tables.length === 0) {
    return {
      answerKey: { codes: [], questions: [], essayBarem: [] },
      warnings: [
        {
          row: 0,
          message:
            "Không tìm thấy bảng nào trong file Word. Đáp án phải nằm trong 1 bảng: cột là mã đề, dòng là câu hỏi.",
        },
      ],
      tablesFound: 0,
    };
  }
  // Chọn bảng có nhiều dòng câu hỏi nhất (tránh nhầm bảng tiêu đề nhỏ).
  let best = tables[0];
  let bestScore = -1;
  for (const t of tables) {
    const score = t.filter((r) => isQuestionLabel((r[0] ?? "").trim())).length;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  const res = parseAnswerTableRows(best);
  res.tablesFound = tables.length;
  return res;
}

/** Mẫu đề thi tốt nghiệp: P1 12 câu ABCD, P2 2 câu × 4 ý, P3 4 câu trả lời ngắn.
 *  Đáp án để trống để GV điền; điểm theo thang chuẩn. */
export function graduationTemplate(codes: string[]): AnswerKey {
  const questions: AnswerQuestion[] = [];
  for (let i = 1; i <= 12; i++) {
    questions.push({ q: String(i), part: "P1", answers: {}, points: P1_POINTS });
  }
  for (const n of [13, 14]) {
    for (const s of ["a", "b", "c", "d"]) {
      questions.push({ q: `${n}${s}`, part: "P2", answers: {}, points: P1_POINTS });
    }
  }
  for (let i = 15; i <= 18; i++) {
    questions.push({ q: String(i), part: "P3", answers: {}, points: P3_POINTS });
  }
  const essayBarem: EssayBaremStep[] = [
    { id: "b1", content: "Bước 1", points: 0.25 },
    { id: "b2", content: "Bước 2", points: 0.25 },
  ];
  return { codes, questions, essayBarem };
}

/** Chuyển văn bản barem tự luận (mỗi dòng "Nội dung | điểm") thành danh sách bước. */
export function parseEssayBaremText(text: string): EssayBaremStep[] {
  const steps: EssayBaremStep[] = [];
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const [content, pts] = line.split("|").map((s) => s.trim());
      const points = parseFloat((pts ?? "").replace(",", ".")) || 0;
      steps.push({ id: `b${i + 1}`, content: content || line, points });
    });
  return steps;
}
