"use client";

// Chọn 1 phiên đã có để SAO CHÉP barem tự luận sang phiên đang tạo/sửa.
// Dùng ở trang tạo phiên và trong khung "Sửa barem" của trang phiên.
import { useEffect, useState } from "react";

type SessionItem = { id: string; title: string; created_at: string };

export default function BaremCopyPicker({
  excludeSessionId,
  onCopy,
}: {
  excludeSessionId?: string;
  onCopy: (steps: { content: string; points: string }[], sourceTitle: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [picked, setPicked] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/sessions", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = ((d?.sessions ?? []) as SessionItem[]).filter((s) => s.id !== excludeSessionId);
        setSessions(list);
      })
      .catch(() => setSessions([]));
  }, [excludeSessionId]);

  async function copy() {
    if (!picked) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/sessions/${picked}`, { cache: "no-store" });
      const d = await res.json();
      const key = (d?.session?.answer_key ?? d?.session?.criteria) as
        | { essayBarem?: { content: string; points: number }[] }
        | null;
      const eb = key?.essayBarem ?? [];
      const src = sessions.find((s) => s.id === picked);
      if (eb.length === 0) {
        setMsg(`Phiên "${src?.title ?? ""}" chưa có barem tự luận để sao chép.`);
        return;
      }
      onCopy(
        eb.map((s) => ({ content: s.content, points: String(s.points).replace(".", ",") })),
        src?.title ?? ""
      );
      setMsg(`Đã sao chép ${eb.length} ý từ phiên "${src?.title ?? ""}". Kiểm tra lại rồi lưu.`);
    } catch {
      setMsg("Không sao chép được. Thử lại.");
    } finally {
      setBusy(false);
    }
  }

  if (sessions.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-teal-800">Sao chép barem từ phiên khác:</span>
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">— Chọn phiên nguồn —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({new Date(s.created_at).toLocaleDateString("vi-VN")})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!picked || busy}
          className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? "Đang chép…" : "Sao chép"}
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
