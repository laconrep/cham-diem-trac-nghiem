// Đọc bảng đáp án trong file Word (.docx) bằng mammoth.
//
// Định dạng bảng kỳ vọng (cột = mã đề, dòng = câu hỏi):
//   | Câu | 101 | 102 | ...
//   | 1   | A   | B   |
//   | 2   | C   | D   |
//   | 13a | Đ   | S   |   <- ý Đúng/Sai (nhãn câu có chữ cái)
//   | 15  | 12  | 7   |   <- trả lời ngắn (đáp án là số/chữ)
//
// Nhận dạng linh hoạt (sửa 25/11/2026): mã đề chấp nhận cả "Mã đề 132",
// "Đề: 209", "132"; nhãn câu chấp nhận "Câu 1", "1.", "(1)", "13a";
// bảng Đúng/Sai có 2 cột nhãn ("Câu" | "Ý") được gộp nhãn thành "1a";
// nhiều bảng đáp án trong 1 file được đọc hết rồi gộp lại.
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

/** Chuẩn hoá ô mã đề: "Mã đề 132" / "Mã đề: 132" / "Đề 209" / "132" -> "132". */
function normalizeCodeCell(cell: string): string {
  return cell
    .trim()
    .replace(/^(mã\s*đề|mã|đề)\s*:?\s*/i, "")
    .trim();
}

function isCodeCell(cell: string): boolean {
  // Mã đề thường là số 2-4 chữ số ("101", "485") hoặc chữ+số ("A1");
  // chấp nhận cả dạng có tiền tố "Mã đề" (đã chuẩn hoá ở normalizeCodeCell)
  // và dạng có gạch nối/gạch dưới bên trong.
  const code = normalizeCodeCell(cell);
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,5}$/.test(code) && !/^câu$/i.test(code);
}

/** Chuẩn hoá nhãn câu: "Câu 1", "Câu 13a", "1.", "(1)", "1)" -> "1", "13a". */
function normalizeLabel(cell: string): string {
  let s = cell.trim();
  s = s.replace(/^câu\s*/i, "");
  s = s.replace(/^\(\s*/, "").replace(/\s*\)$/, "");
  s = s.replace(/[.)\s:-]+$/, "");
  return s.trim();
}

/** Chuẩn hoá ô Ý (bảng Đúng/Sai 2 cột nhãn): "a)", "a.", "(a)" -> "a". */
function normalizeSub(cell: string): string {
  let s = cell.trim().toLowerCase();
  s = s.replace(/^\(\s*/, "").replace(/\s*\)$/, "");
  s = s.replace(/[.)\s]+$/, "");
  return s;
}

function isQuestionLabel(cell: string): boolean {
  // "1", "13a", "13A", "15" ... (số, có thể kèm 1 chữ cái cho ý Đúng/Sai)
  return /^\d{1,3}[a-dA-D]?$/.test(normalizeLabel(cell));
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
  // Bảng Đúng/Sai có thể có 2 cột nhãn ("Câu" | "Ý") — khi đó mã đề bắt đầu từ cột thứ 3.
  let headerIdx = -1;
  let codes: string[] = [];
  let labelCols = 1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    const first = (row[0] ?? "").trim().toLowerCase();
    if (first === "câu" || first === "câu hỏi" || first === "") {
      const second = (row[1] ?? "").trim().toLowerCase();
      const twoLabelCols = second === "ý" || second === "y";
      const rest = row
        .slice(twoLabelCols ? 2 : 1)
        .map((c) => normalizeCodeCell(c))
        .filter(Boolean);
      if (rest.length >= 1 && rest.every(isCodeCell)) {
        headerIdx = i;
        codes = rest;
        labelCols = twoLabelCols ? 2 : 1;
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
    const rawLabel = (row[0] ?? "").trim();
    if (!rawLabel) continue;
    if (/^phần/i.test(rawLabel)) continue; // dòng phân mục "Phần I", "Phần II"...
    let label = normalizeLabel(rawLabel);
    if (labelCols === 2) {
      const sub = normalizeSub(row[1] ?? "");
      if (!sub) {
        warnings.push({ row: i + 1, message: `Dòng ${i + 1}: thiếu ký hiệu ý (a, b, c, d) ở cột Ý. Dòng này bị bỏ qua.` });
        continue;
      }
      label = label + sub;
    }
    if (!isQuestionLabel(label)) {
      warnings.push({ row: i + 1, message: `Dòng ${i + 1}: nhãn câu “${rawLabel}” không nhận dạng được (mong đợi dạng 1, 2, 13a...). Dòng này bị bỏ qua.` });
      continue;
    }
    const answers: Record<string, string> = {};
    let firstAnswer = "";
    codes.forEach((code, ci) => {
      const val = (row[labelCols + ci] ?? "").trim();
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

/** Đọc file .docx (Buffer) -> AnswerKey + cảnh báo. Đọc tất cả các bảng đáp án rồi gộp lại. */
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
  // Đọc TẤT CẢ các bảng trông như bảng đáp án rồi gộp lại (đề có thể tách
  // trắc nghiệm và Đúng/Sai thành 2 bảng riêng). Bảng nào không đọc được
  // (vd bảng barem Nội dung/Điểm) thì bỏ qua.
  const warnings: ParseWarning[] = [];
  const codes: string[] = [];
  const questions: AnswerQuestion[] = [];
  const seen = new Set<string>();
  for (const t of tables) {
    const res = parseAnswerTableRows(t);
    if (res.answerKey.questions.length === 0) continue;
    for (const c of res.answerKey.codes) {
      if (!codes.includes(c)) codes.push(c);
    }
    for (const q of res.answerKey.questions) {
      const key = `${q.part}:${q.q}`;
      if (seen.has(key)) {
        warnings.push({
          row: 0,
          message: `Câu ${q.q} xuất hiện ở nhiều bảng — chỉ giữ đáp án ở bảng đầu tiên.`,
        });
        continue;
      }
      seen.add(key);
      questions.push(q);
    }
    warnings.push(...res.warnings);
  }
  if (questions.length === 0) {
    // Không bảng nào đọc được: trả cảnh báo của bảng đầu tiên (giữ hành vi cũ).
    const first = parseAnswerTableRows(tables[0]);
    warnings.push(...first.warnings);
  }
  // Barem tự luận: đọc thêm từ file Word (mục "BAREM TỰ LUẬN" hoặc bảng Nội dung/Điểm)
  // để màn hình tạo phiên tự điền — trước đây luôn trả [] nên GV phải nhập tay.
  const essayBarem = extractEssayBaremFromHtml(html);
  if (essayBarem.length === 0 && /tự luận/i.test(html)) {
    warnings.push({
      row: 0,
      message:
        "Chưa thấy barem tự luận trong file Word — nếu đề có tự luận, nhập tay vào ô “Barem tự luận” bên dưới (mỗi dòng “Nội dung | điểm”).",
    });
  }
  return {
    answerKey: { codes, questions, essayBarem },
    warnings,
    tablesFound: tables.length,
  };
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
  // Mẫu đề thi tốt nghiệp chấm Đúng/Sai theo thang Bộ.
  return { codes, questions, essayBarem, p2Mode: "bo" };
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

/** Chuyển HTML mammoth thành các dòng văn bản (mỗi <p>/<li>/<h*> một dòng). */
function htmlToLines(html: string): string[] {
  return html
    .replace(/<(br|p|li|h[1-6]|tr|div)[^>]*>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Đọc barem tự luận trong file Word (để màn hình tạo phiên tự điền, khỏi nhập tay).
 * Hỗ trợ 3 dạng: (1) bảng có cột "Nội dung/Bước" + "Điểm";
 * (2) đoạn văn sau dòng "BAREM TỰ LUẬN", mỗi dòng "Nội dung | điểm";
 * (3) đáp án tự luận viết thành đoạn văn trong mục "TỰ LUẬN"
 *     (Câu N (X điểm): a) (Y điểm) ... b) (Y điểm) ...).
 * Trả về [] khi file không có mục barem (đề chỉ có trắc nghiệm).
 */
function extractEssayBaremFromHtml(html: string): EssayBaremStep[] {
  const tables = extractTables(html);
  for (const t of tables) {
    const head = (t[0] ?? []).map((c) => c.toLowerCase());
    const hasContent = head.some((c) => c.includes("nội dung") || c.includes("bước"));
    const hasPoints = head.some((c) => c.includes("điểm"));
    if (hasContent && hasPoints) {
      const steps: EssayBaremStep[] = [];
      for (let i = 1; i < t.length; i++) {
        const row = t[i];
        const content = (row[0] ?? "").trim();
        const pts = parseFloat((row[1] ?? "").trim().replace(",", "."));
        if (content && !Number.isNaN(pts) && pts > 0) {
          steps.push({ id: `b${steps.length + 1}`, content, points: pts });
        }
      }
      if (steps.length > 0) return steps;
    }
  }
  const lines = htmlToLines(html);
  const idx = lines.findIndex((l) => /barem\s+tự\s+luận/i.test(l));
  if (idx !== -1) {
    const baremLines: string[] = [];
    for (let i = idx + 1; i < lines.length && baremLines.length < 30; i++) {
      const line = lines[i];
      // Dừng ở tiêu đề mục mới (vd "2 CÂU CẦN ĐỐI CHIẾU...").
      if (/^\d+\s+câu cần/i.test(line)) break;
      const m = line.match(/^(.*)\|\s*([\d]+(?:[.,]\d+)?)\s*$/);
      if (m) baremLines.push(`${m[1].trim()} | ${m[2]}`);
    }
    const fromSection = parseEssayBaremText(baremLines.join("\n"));
    if (fromSection.length > 0) return fromSection;
  }
  // Dạng 3: đáp án tự luận viết thành đoạn văn trong mục "TỰ LUẬN"
  // (Câu N (X điểm): a) (Y điểm) ... b) (Y điểm) ...).
  return extractEssayBaremFromProse(lines);
}

/**
 * Đọc barem tự luận viết dạng đoạn văn (định dạng GV hay dùng trong file
 * đáp án chính thức):
 *   PHẦN III. TỰ LUẬN (3,0 điểm)
 *   Câu 1 (2,0 điểm):
 *   a) (1,0 điểm) <đề bài>. Hướng dẫn chấm: ...
 *   b) (1,0 điểm) <đề bài>. Hướng dẫn chấm: ...
 * Mỗi ý a/b thành 1 bước barem (nội dung = "Câu 1a: ..." + toàn văn ý đó).
 * Câu không chia ý (chỉ "Câu N (X điểm) <nội dung>") thành 1 bước X điểm.
 */
function extractEssayBaremFromProse(lines: string[]): EssayBaremStep[] {
  const start = lines.findIndex((l) => /tự\s*luận/i.test(l));
  if (start === -1) return [];
  const parsePts = (s: string) => parseFloat(s.replace(",", "."));
  const qRe = /^câu\s*(\d{1,3})\s*[.:]?\s*\(\s*([\d.,]+)\s*điểm\s*\)\s*:?\s*(.*)$/i;
  const subRe = /^([a-d])[.)]\s*\(\s*([\d.,]+)\s*điểm\s*\)\s*(.*)$/i;
  const steps: EssayBaremStep[] = [];
  let currentQ = "";
  let pendingQ: { q: string; points: number; text: string } | null = null;
  const flushPending = () => {
    if (pendingQ && pendingQ.text.trim()) {
      steps.push({
        id: `b${steps.length + 1}`,
        content: `Câu ${pendingQ.q}: ${pendingQ.text.trim()}`.replace(/\|/g, "/"),
        points: pendingQ.points,
      });
    }
    pendingQ = null;
  };
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^ghi\s*chú/i.test(line)) break;
    const qm = line.match(qRe);
    if (qm) {
      flushPending();
      currentQ = qm[1];
      const rest = (qm[3] ?? "").trim();
      if (rest) pendingQ = { q: currentQ, points: parsePts(qm[2]), text: rest };
      continue;
    }
    const sm = line.match(subRe);
    if (sm && currentQ) {
      // Đã có ý a/b -> bỏ bước chờ của câu cha (điểm câu cha = tổng các ý).
      pendingQ = null;
      const pts = parsePts(sm[2]);
      if (!Number.isNaN(pts) && pts > 0) {
        steps.push({
          id: `b${steps.length + 1}`,
          content: `Câu ${currentQ}${sm[1].toLowerCase()}: ${(sm[3] ?? "").trim()}`.replace(/\|/g, "/"),
          points: pts,
        });
      }
      continue;
    }
    // Dòng nối tiếp của câu không chia ý: ghép vào nội dung đang chờ.
    if (pendingQ) pendingQ.text += ` ${line}`;
  }
  flushPending();
  return steps;
}
