"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnswerKey, QuestionPart } from "@/lib/types";
import { graduationTemplate } from "@/lib/answer-key";

interface Warning {
  row: number;
  message: string;
}

const PART_LABEL: Record<QuestionPart, string> = {
  P1: "Phần I — Trắc nghiệm ABCD",
  P2: "Phần II — Đúng/Sai",
  P3: "Phần III — Trả lời ngắn",
  P4: "Phần IV — Tự luận",
};

export default function NewSessionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [answerKey, setAnswerKey] = useState<AnswerKey | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Barem tự luận dạng từng ý + điểm (điểm giữ dạng chữ để gõ được "0,5").
  const [essaySteps, setEssaySteps] = useState<{ content: string; points: string }[]>([]);
  // Cách tính điểm Đúng/Sai: false = mặc định mỗi ý đúng 0,25đ;
  // true = "chấm theo mẫu bộ" (thang Bộ theo số ý đúng).
  const [p2BoMode, setP2BoMode] = useState(false);
  const essayTotal = useMemo(
    () => essaySteps.reduce((a, s) => a + (parseFloat(s.points.replace(",", ".")) || 0), 0),
    [essaySteps]
  );

  function updateEssayStep(idx: number, patch: Partial<{ content: string; points: string }>) {
    setEssaySteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addEssayStep() {
    setEssaySteps((prev) => [...prev, { content: "", points: "0.5" }]);
  }

  function removeEssayStep(idx: number) {
    setEssaySteps((prev) => prev.filter((_, i) => i !== idx));
  }

  const codes = useMemo(() => answerKey?.codes ?? [], [answerKey]);

  async function handleFile(file: File) {
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse-answer", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Không đọc được file Word.");
        return;
      }
      setAnswerKey(data.answerKey as AnswerKey);
      setWarnings((data.warnings ?? []) as Warning[]);
      // File tải lên: mặc định Đúng/Sai 0,25đ/ý (GV tick "mẫu bộ" nếu muốn thang Bộ).
      setP2BoMode(false);
      // Barem tự luận trong file Word (nếu có) tự tách thành từng ý + điểm bên dưới.
      const eb = (data.answerKey?.essayBarem ?? []) as { content: string; points: number }[];
      setEssaySteps(eb.map((s) => ({ content: s.content, points: String(s.points) })));
      if ((data.answerKey?.questions?.length ?? 0) === 0) {
        setError("File Word không có câu hỏi nào đọc được. Kiểm tra lại bảng đáp án (cột = mã đề, dòng = câu hỏi).");
      }
    } catch {
      setError("Không đọc được file Word. Thử lại.");
    } finally {
      setLoading(false);
    }
  }

  function loadTemplate() {
    const codeList = codes.length > 0 ? codes : ["101"];
    setAnswerKey(graduationTemplate(codeList));
    // Mẫu đề thi tốt nghiệp: Đúng/Sai chấm theo thang Bộ.
    setP2BoMode(true);
    setWarnings([{ row: 0, message: "Đã nạp mẫu đề thi tốt nghiệp (12 câu P1, 2 câu P2 × 4 ý, 4 câu P3). Hãy điền đáp án cho từng mã đề rồi duyệt." }]);
  }

  function updateAnswer(qIdx: number, code: string, value: string) {
    if (!answerKey) return;
    const questions = answerKey.questions.map((q, i) =>
      i === qIdx ? { ...q, answers: { ...q.answers, [code]: value } } : q
    );
    setAnswerKey({ ...answerKey, questions });
  }

  function updatePoints(qIdx: number, points: number) {
    if (!answerKey) return;
    const questions = answerKey.questions.map((q, i) => (i === qIdx ? { ...q, points } : q));
    setAnswerKey({ ...answerKey, questions });
  }

  function updatePart(qIdx: number, part: QuestionPart) {
    if (!answerKey) return;
    const questions = answerKey.questions.map((q, i) => (i === qIdx ? { ...q, part } : q));
    setAnswerKey({ ...answerKey, questions });
  }

  function addCode() {
    if (!answerKey) return;
    const next = `M${answerKey.codes.length + 1}`;
    const code = window.prompt("Nhập mã đề mới:", next);
    if (!code) return;
    const trimmed = code.trim();
    if (!trimmed || answerKey.codes.includes(trimmed)) return;
    setAnswerKey({ ...answerKey, codes: [...answerKey.codes, trimmed] });
  }

  async function save() {
    if (!title.trim()) {
      setError("Nhập tên phiên (vd: Kiểm tra giữa kì — Sinh 12).");
      return;
    }
    if (!answerKey || answerKey.questions.length === 0) {
      setError("Chưa có tiêu chí chấm. Hãy tải file Word đáp án hoặc nạp mẫu thi tốt nghiệp.");
      return;
    }
    const empty = answerKey.questions.filter((q) => codes.every((c) => !(q.answers[c] ?? "").trim()));
    if (empty.length > 0) {
      if (!window.confirm(`Còn ${empty.length} câu chưa có đáp án (vd câu ${empty[0].q}). Vẫn lưu phiên?`)) return;
    }
    // Barem tự luận: từng ý + điểm, bỏ ý trống.
    const essayBarem = essaySteps
      .filter((s) => s.content.trim())
      .map((s, i) => ({
        id: `b${i + 1}`,
        content: s.content.trim(),
        points: parseFloat(s.points.replace(",", ".")) || 0,
      }));
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          answerKey: { ...answerKey, essayBarem, p2Mode: p2BoMode ? "bo" : "perItem" },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Không lưu được phiên.");
        return;
      }
      router.push(`/sessions/${data.id}`);
    } catch {
      setError("Không lưu được phiên. Thử lại.");
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    if (!answerKey) return [];
    const parts: QuestionPart[] = ["P1", "P2", "P3"];
    return parts
      .map((p) => ({ part: p, rows: answerKey.questions.map((q, i) => ({ q, i })).filter((x) => x.q.part === p) }))
      .filter((g) => g.rows.length > 0);
  }, [answerKey]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Tạo phiên chấm mới</h1>
      <p className="mt-1 text-sm text-slate-600">
        Bước 1: tải file Word đáp án (bảng: cột là mã đề, dòng là câu hỏi). Bước 2: kiểm tra và
        sửa tiêu chí chấm dưới đây. Bước 3: bấm “Lưu phiên” — chỉ sau khi duyệt tiêu chí thì
        phiên mới được tạo và mới bắt đầu chấm.
      </p>

      <div className="mt-6 space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-semibold">Tên phiên</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="vd: Kiểm tra giữa kì — Sinh 12"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="mt-4 block text-sm font-semibold">File Word đáp án (.docx)</label>
          <input
            type="file"
            accept=".docx"
            disabled={loading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="mt-1 w-full text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={loadTemplate}
              className="rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-800 hover:bg-teal-50"
            >
              Nạp mẫu đề thi tốt nghiệp
            </button>
            {answerKey && (
              <button
                type="button"
                onClick={addCode}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                + Thêm mã đề
              </button>
            )}
          </div>
          {loading && <p className="mt-2 text-sm text-slate-500">Đang đọc file Word…</p>}
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>⚠ {w.message}</li>
              ))}
            </ul>
          )}
        </div>

        {answerKey && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-bold">Tiêu chí chấm — kiểm tra và sửa trước khi lưu</h2>
            <p className="mt-1 text-sm text-slate-600">
              Mã đề: {codes.join(", ") || "—"} · {answerKey.questions.length} câu. Sửa trực tiếp
              đáp án / điểm / phần trong bảng.
            </p>
            {answerKey.questions.some((q) => q.part === "P2") && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={p2BoMode}
                  onChange={(e) => setP2BoMode(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  <b>Chấm theo mẫu bộ</b> — Phần II Đúng/Sai tính theo thang Bộ theo số ý đúng
                  (1 ý: 0,1 · 2 ý: 0,25 · 3 ý: 0,5 · 4 ý: 1,0). Không tick: mỗi ý đúng được
                  0,25 điểm.
                </span>
              </label>
            )}
            {grouped.map((g) => (
              <div key={g.part} className="mt-4">
                <h3 className="text-sm font-bold text-teal-800">{PART_LABEL[g.part]}</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="border px-2 py-1 text-left">Câu</th>
                        {codes.map((c) => (
                          <th key={c} className="border px-2 py-1">Mã đề {c}</th>
                        ))}
                        <th className="border px-2 py-1">Điểm</th>
                        <th className="border px-2 py-1">Phần</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(({ q, i }) => (
                        <tr key={i} className="odd:bg-white even:bg-slate-50">
                          <td className="border px-2 py-1 font-semibold">{q.q}</td>
                          {codes.map((c) => (
                            <td key={c} className="border px-1 py-1">
                              <input
                                value={q.answers[c] ?? ""}
                                onChange={(e) => updateAnswer(i, c, e.target.value)}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-center"
                              />
                            </td>
                          ))}
                          <td className="border px-1 py-1">
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              value={q.points}
                              onChange={(e) => updatePoints(i, parseFloat(e.target.value) || 0)}
                              className="w-20 rounded border border-slate-200 px-2 py-1 text-center"
                            />
                          </td>
                          <td className="border px-1 py-1">
                            <select
                              value={q.part}
                              onChange={(e) => updatePart(i, e.target.value as QuestionPart)}
                              className="rounded border border-slate-200 px-1 py-1"
                            >
                              <option value="P1">P1</option>
                              <option value="P2">P2</option>
                              <option value="P3">P3</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <h3 className="mt-6 text-sm font-bold text-teal-800">Barem tự luận (Phần IV) — không bắt buộc</h3>
            <p className="text-xs text-slate-500">Đã tự tách từ file Word thành từng ý + điểm — sửa trực tiếp tại đây, thêm hoặc xóa ý nếu cần. Điểm nhỏ nhất 0,25.</p>
            <div className="mt-2 space-y-2">
              {essaySteps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    value={s.content}
                    onChange={(e) => updateEssayStep(i, { content: e.target.value })}
                    rows={2}
                    placeholder="Nội dung ý (vd: Viết đúng phương trình)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={s.points}
                    onChange={(e) => updateEssayStep(i, { points: e.target.value })}
                    title="Điểm của ý này"
                    className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-center text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeEssayStep(i)}
                    title="Xóa ý này"
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={addEssayStep}
                className="rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50"
              >
                + Thêm ý
              </button>
              <span className="text-xs text-slate-500">
                Tổng điểm tự luận: <b>{Number(essayTotal.toFixed(2))}đ</b> ({essaySteps.length} ý)
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !answerKey}
            className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Duyệt tiêu chí & Lưu phiên"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
