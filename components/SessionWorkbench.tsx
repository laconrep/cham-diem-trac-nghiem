"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GradeResultRow, Submission, SubmissionStatus } from "@/lib/types";
import { SUBMISSION_STATUS_CLASS, SUBMISSION_STATUS_LABEL } from "@/lib/types";

interface ResultItem {
  submission: Submission;
  result: GradeResultRow | null;
}

interface JobInfo {
  id: string;
  status: string;
  total: number;
  completed: number;
  progress: number;
  stage: string | null;
}

interface GroupPhoto {
  id: string;
  url: string;
  file: File | Blob;
  name: string;
}

export default function SessionWorkbench({
  sessionId,
  sessionTitle,
}: {
  sessionId: string;
  sessionTitle: string;
}) {
  // ---------- Camera (mở liên tục, không đóng/mở lại giữa các bài) ----------
  // Thử camera sau trước (chụp bài trên điện thoại); nếu máy không có camera
  // sau (máy tính, một số trình duyệt) thì thử lại với camera bất kỳ.
  // Có máy cấp quyền nhưng không đưa hình về (màn hình đen thui) thì cũng
  // coi như mở lỗi: dừng luồng đó, thử cách khác. Lỗi nào cũng báo rõ lý do
  // để GV biết phải làm gì (cấp quyền / đổi thiết bị / đóng app khác).
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraStatus, setCameraStatus] = useState("Đang mở camera…");
  const [useFileMode, setUseFileMode] = useState(false);
  const cameraCancelledRef = useRef(false);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Chờ khung hình thật từ thẻ video (tối đa ms). Trả về false nếu video vẫn đen. */
  function waitForFrames(video: HTMLVideoElement, ms = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        // Có máy chỉ phát khi play() được gọi lại sau khi có metadata.
        if (video.paused) void video.play().catch(() => undefined);
        if (video.videoWidth > 0 && video.readyState >= 2) return resolve(true);
        if (Date.now() - start > ms) return resolve(false);
        setTimeout(tick, 300);
      };
      tick();
    });
  }

  async function startCamera() {
    cameraCancelledRef.current = false;
    setCameraError("");
    setCameraOn(false);
    setCameraStatus("Đang mở camera…");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Trình duyệt này không hỗ trợ camera. Dùng ô chọn file ảnh bên dưới (chụp bài bằng app camera của điện thoại rồi chọn ảnh).");
      setCameraStatus("");
      setUseFileMode(true);
      return;
    }
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: true, audio: false },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    ];
    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cameraCancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setUseFileMode(false);
        // Đợi React vẽ lại thẻ video (trường hợp bấm thử lại sau lỗi) rồi mới gắn luồng.
        await sleep(150);
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* thử lại trong waitForFrames */
          }
        }
        const hasFrames = video ? await waitForFrames(video) : false;
        if (cameraCancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (hasFrames) {
          setCameraOn(true);
          setCameraStatus("");
          return;
        }
        // Có luồng nhưng không có hình (đen thui) → dừng luồng này, thử cách khác.
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        lastErr = new Error("black");
        setCameraStatus("Camera đã mở nhưng chưa có hình, đang thử lại…");
      } catch (e) {
        lastErr = e;
      }
    }
    if (cameraCancelledRef.current) return;
    setCameraStatus("");
    const name = (lastErr as DOMException | null)?.name ?? "";
    if ((lastErr as Error)?.message === "black") {
      setCameraError("Camera đã mở nhưng màn hình vẫn đen (máy không đưa hình về). Thử: 1) tắt app camera khác đang mở, 2) bấm “Thử mở lại camera”, 3) hoặc dùng ô chọn file ảnh bên dưới — chụp bằng app camera của điện thoại rồi chọn ảnh.");
    } else if (name === "NotAllowedError") {
      setCameraError("Trình duyệt đã chặn quyền camera. Bấm biểu tượng ổ khóa (hoặc camera) trên thanh địa chỉ → cho phép dùng camera, rồi bấm “Thử mở lại camera”.");
    } else if (name === "NotFoundError") {
      setCameraError("Không tìm thấy camera trên thiết bị này. Dùng ô chọn file ảnh bên dưới — chụp bài bằng app camera của điện thoại rồi chọn ảnh.");
    } else if (name === "NotReadableError") {
      setCameraError("Camera đang bận (một ứng dụng khác đang dùng camera). Đóng ứng dụng đó rồi bấm “Thử mở lại camera”.");
    } else {
      setCameraError("Không mở được camera. Dùng ô chọn file ảnh bên dưới (chụp bài bằng app camera rồi chọn ảnh) hoặc bấm “Thử mở lại camera”.");
    }
    setUseFileMode(true);
  }

  useEffect(() => {
    void startCamera();
    return () => {
      cameraCancelledRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gắn lại luồng camera vào thẻ video khi nó được vẽ lại (vd sau khi bấm
  // “Thử mở lại camera” thành công — lúc đó thẻ video mới xuất hiện trở lại).
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [cameraOn, useFileMode]);

  // ---------- Nhóm ảnh của 1 bài HS (tách riêng từng bài) ----------
  // KHÔNG nhập tên HS: AI tự đọc tên trên bài làm khi chấm và điền vào kết quả
  // (bác chốt 19/11 ~17:03); bài nào đọc không ra thì tạm hiện "HS N" theo thứ tự chụp.
  const [groupPhotos, setGroupPhotos] = useState<GroupPhoto[]>([]);
  const [groupNo, setGroupNo] = useState(1);
  const [groupsDone, setGroupsDone] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  function addPhoto(file: File | Blob, name: string) {
    const url = URL.createObjectURL(file);
    setGroupPhotos((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, url, file, name }]);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) addPhoto(blob, `anh-${groupPhotos.length + 1}.jpg`);
    }, "image/jpeg", 0.85);
  }

  function removePhoto(id: string) {
    setGroupPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function finishGroup() {
    if (groupPhotos.length === 0) {
      setNotice("Chưa có ảnh nào trong nhóm này. Chụp 2–3 ảnh rồi mới bấm “Chấm xong”.");
      return;
    }
    setUploading(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("session_id", sessionId);
      groupPhotos.forEach((p) => form.append("files", p.file, p.name));
      const res = await fetch("/api/submissions", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) {
        setNotice(data.error ?? "Tải ảnh thất bại.");
        return;
      }
      // Chốt nhóm: ảnh đã vào hàng chờ chấm ngầm; camera vẫn mở, sang bài tiếp theo.
      groupPhotos.forEach((p) => URL.revokeObjectURL(p.url));
      setGroupPhotos([]);
      setGroupsDone((n) => n + 1);
      const next = groupNo + 1;
      setGroupNo(next);
      setNotice(`Đã đưa bài “HS ${groupNo}” vào hàng chờ chấm (tên HS sẽ do AI đọc trên bài làm). Chụp tiếp bài sau — camera vẫn mở.`);
      void refreshResults();
    } catch {
      setNotice("Tải ảnh thất bại. Thử lại.");
    } finally {
      setUploading(false);
    }
  }

  // ---------- Barem tự luận đã lưu (để GV kiểm chứng đã nạp được) ----------
  const [essayBarem, setEssayBarem] = useState<{ content: string; points: number }[]>([]);
  const [criteriaLoaded, setCriteriaLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const key = (d?.session?.answer_key ?? d?.session?.criteria) as
          | { essayBarem?: { content: string; points: number }[] }
          | null;
        setEssayBarem(key?.essayBarem ?? []);
        setCriteriaLoaded(true);
      })
      .catch(() => setCriteriaLoaded(true));
  }, [sessionId]);

  // ---------- Kết quả chấm (poll nhẹ, hiện dần theo thứ tự chấm) ----------
  const [items, setItems] = useState<ResultItem[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Bấm Esc để đóng ảnh phóng to.
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);
  const [gradeMsg, setGradeMsg] = useState("");

  const refreshResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/results`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setItems(data.items as ResultItem[]);
        setJobs((data.jobs ?? []) as JobInfo[]);
      }
    } catch {
      /* poll sau sẽ thử lại */
    }
  }, [sessionId]);

  const hasPending = items.some((it) => it.submission.status === "queued" || it.submission.status === "grading");
  const activeJob = jobs.find((j) => j.status === "queued" || j.status === "processing");

  useEffect(() => {
    void refreshResults();
  }, [refreshResults]);

  useEffect(() => {
    if (!hasPending && !activeJob) return;
    const t = setInterval(() => void refreshResults(), 5000);
    return () => clearInterval(t);
  }, [hasPending, activeJob, refreshResults]);

  async function gradeAll() {
    setGradeMsg("Đang tạo job chấm…");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/grade`, { method: "POST" });
      const data = await res.json();
      setGradeMsg(data.ok ? (data.jobId ? `Đã xếp ${data.attached ?? 0} bài vào hàng chờ chấm.` : "Không còn bài nào chưa chấm.") : (data.error ?? "Không tạo được job."));
      void refreshResults();
    } catch {
      setGradeMsg("Không tạo được job. Thử lại.");
    }
  }

  async function approve(resultId: string) {
    await fetch(`/api/results/${resultId}/approve`, { method: "POST" });
    void refreshResults();
  }

  return (
    <div className="space-y-6">
      {/* ===== Màn hình chụp ===== */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Chụp bài — {sessionTitle}</h2>
          <span className="text-sm text-slate-500">
            {cameraOn ? "● Camera đang mở" : "○ Camera chưa mở"} · Đã chốt {groupsDone} bài trong phiên này
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Chụp 2–3 ảnh cho 1 học sinh (phiếu trắc nghiệm + trang tự luận) rồi bấm{" "}
          <b>“Chấm xong”</b> để chốt bài đó vào hàng chờ chấm ngầm, sau đó chụp tiếp bài sau —
          camera không đóng/mở lại.
        </p>

        {!useFileMode && (
          <div className="mt-4 overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="mx-auto max-h-[420px] w-full object-contain" />
          </div>
        )}
        {cameraError && (
          <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p>{cameraError}</p>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="mt-2 rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Thử mở lại camera
            </button>
          </div>
        )}
        {cameraStatus && !cameraError && (
          <p className="mt-3 text-sm text-slate-500">{cameraStatus}</p>
        )}
        {!useFileMode && cameraOn && (
          <button
            type="button"
            onClick={capturePhoto}
            className="mt-3 w-full rounded-lg bg-teal-700 py-3 text-base font-bold text-white hover:bg-teal-800"
          >
            📷 Chụp ảnh
          </button>
        )}
        {(useFileMode || !cameraOn) && (
          <div className="mt-3">
            <label className="block text-sm font-semibold">Chọn ảnh từ máy (chụp bằng app camera rồi chọn nhiều ảnh cùng lúc)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                files.forEach((f) => addPhoto(f, f.name));
                e.target.value = "";
              }}
              className="mt-1 w-full text-sm"
            />
            {!cameraOn && !cameraError && (
              <button type="button" onClick={() => void startCamera()} className="mt-2 text-sm text-teal-800 underline">
                Thử mở lại camera
              </button>
            )}
          </div>
        )}

        {/* Nhóm ảnh của bài đang chụp */}
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <p className="text-sm">
            <span className="font-semibold">Bài đang chụp: HS {groupNo}</span>{" "}
            <span className="text-slate-500">
              (tên học sinh sẽ do AI đọc trên bài làm khi chấm; bài nào đọc không ra thì giữ tên tạm “HS {groupNo}”)
            </span>
          </p>
          {groupPhotos.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Chưa có ảnh nào trong nhóm này.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {groupPhotos.map((p, i) => (
                <div key={p.id} className="relative w-36">
                  <img src={p.url} alt={`Ảnh ${i + 1}`} className="h-28 w-full rounded object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">Ảnh {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    className="absolute right-1 top-1 rounded bg-red-600 px-1.5 text-xs text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void finishGroup()}
            disabled={uploading || groupPhotos.length === 0}
            className="mt-4 rounded-lg bg-green-700 px-5 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50"
          >
            {uploading ? "Đang tải lên…" : "✓ Chấm xong — chốt bài này"}
          </button>
          {notice && <p className="mt-2 text-sm text-slate-700">{notice}</p>}
        </div>
      </section>

      {/* ===== Barem tự luận đã lưu ===== */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold">Barem tự luận đã lưu (Phần IV)</h2>
        {!criteriaLoaded ? (
          <p className="mt-1 text-sm text-slate-500">Đang tải…</p>
        ) : essayBarem.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">
            Phiên này chưa có barem tự luận. Barem được nạp khi tạo phiên (từ mục “Barem tự luận” trong file Word hoặc nhập tay ở ô barem).
          </p>
        ) : (
          <>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {essayBarem.map((s, i) => (
                <li key={i}>
                  {s.content} — <b>{s.points}đ</b>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-slate-600">
              Tổng barem tự luận:{" "}
              <b>{Number(essayBarem.reduce((a, s) => a + (s.points || 0), 0).toFixed(2))}đ</b>
            </p>
          </>
        )}
      </section>

      {/* ===== Điều khiển phiên ===== */}
      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void gradeAll()}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Chấm bài AI (toàn bộ bài chưa chấm)
        </button>
        <a
          href={`/api/export/${sessionId}`}
          className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
        >
          ⬇ Xuất Excel bảng điểm
        </a>
        {activeJob && (
          <span className="self-center rounded bg-amber-100 px-3 py-1 text-sm text-amber-800">
            Đang chấm ngầm: {activeJob.completed}/{activeJob.total} bài ({activeJob.progress}%)
            {activeJob.stage ? ` — ${activeJob.stage}` : ""}
          </span>
        )}
        {gradeMsg && <span className="self-center text-sm text-slate-600">{gradeMsg}</span>}
      </section>

      {/* ===== Kết quả (bài chấm trước nằm đầu) ===== */}
      <section>
        <h2 className="text-lg font-bold">Kết quả chấm</h2>
        <p className="text-sm text-slate-500">
          Bài nào chấm trước nằm đầu, chấm sau nằm tiếp theo. Bài chưa chấm nằm cuối kèm trạng thái.
          {hasPending || activeJob ? " Trang tự cập nhật mỗi 5 giây trong lúc chấm ngầm." : ""}
        </p>
        {items.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
            Chưa có bài nào. Chụp bài ở khung trên rồi bấm “Chấm xong”.
          </div>
        ) : (
          <ul className="mt-3 space-y-4">
            {items.map(({ submission, result }) => (
              <li key={submission.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold">{submission.student_name}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SUBMISSION_STATUS_CLASS[submission.status as SubmissionStatus]}`}>
                    {SUBMISSION_STATUS_LABEL[submission.status as SubmissionStatus] ?? submission.status}
                  </span>
                  {result?.score_total !== null && result?.score_total !== undefined && (
                    <span className="text-sm font-bold text-teal-800">Tổng: {Number(result.score_total).toFixed(2)} / 10</span>
                  )}
                  {result?.approved && (
                    <span className="rounded bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">Đã duyệt</span>
                  )}
                </div>

                {/* Ảnh gốc */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {submission.files.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer">
                      <img src={f.url} alt={`Bài làm ${i + 1}`} className="h-32 rounded border object-cover" />
                    </a>
                  ))}
                </div>

                {result ? (
                  <div className="mt-3">
                    {result.status === "error" ? (
                      <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                        Chấm lỗi: {result.feedback ?? "Không rõ lý do."}
                      </p>
                    ) : (
                      <>
                        <div className="text-sm">
                          <span>Trắc nghiệm: <b>{result.score_mcq !== null ? Number(result.score_mcq).toFixed(2) : "—"}</b></span>
                          {" · "}
                          <span>Tự luận: <b>{result.score_essay !== null ? Number(result.score_essay).toFixed(2) : "—"}</b></span>
                          {result.per_question?.exam_code && <span> · Mã đề: <b>{result.per_question.exam_code}</b></span>}
                        </div>
                        {(result.annotated_image_url || result.annotated_essay_image_url) && (
                          <div className="mt-2 flex gap-4 overflow-x-auto pb-1">
                            {result.annotated_image_url && (
                              <div className="w-[calc(50%-8px)] min-w-[280px] shrink-0">
                                <p className="text-sm font-semibold">Ảnh trắc nghiệm đã chấm (xanh lá = chọn đúng, đỏ = chọn sai, vàng = đáp án đúng):</p>
                                <button type="button" onClick={() => setLightboxUrl(result.annotated_image_url)} className="mt-1 block w-full cursor-zoom-in" title="Bấm để xem to">
                                  <img src={result.annotated_image_url} alt="Ảnh đã chấm" className="max-h-80 w-full rounded border object-contain" />
                                </button>
                              </div>
                            )}
                            {result.annotated_essay_image_url && (
                              <div className="w-[calc(50%-8px)] min-w-[280px] shrink-0">
                                <p className="text-sm font-semibold">Ảnh tự luận đã chấm (khung ghi chú từng bước barem, đỏ = điểm, vàng = chỗ sai):</p>
                                <button type="button" onClick={() => setLightboxUrl(result.annotated_essay_image_url)} className="mt-1 block w-full cursor-zoom-in" title="Bấm để xem to">
                                  <img src={result.annotated_essay_image_url} alt="Ảnh tự luận đã chấm" className="mt-1 max-h-80 w-full rounded border object-contain" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {result.per_question && (result.per_question.items.length > 0 || result.per_question.essay_steps.length > 0) && (
                          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50">
                            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">Chấm chi tiết</summary>
                            <div className="border-t border-slate-200 px-3 py-2">
                              {result.per_question.items.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full border-collapse text-sm">
                                    <thead>
                                      <tr className="bg-slate-800 text-white">
                                        <th className="border px-2 py-1">Câu</th>
                                        <th className="border px-2 py-1">HS chọn</th>
                                        <th className="border px-2 py-1">Đáp án đúng</th>
                                        <th className="border px-2 py-1">Kết quả</th>
                                        <th className="border px-2 py-1">Điểm</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {result.per_question.items.map((it) => (
                                        <tr key={it.q} className={it.is_correct === true ? "bg-green-50" : it.is_correct === false ? "bg-red-50" : "bg-amber-50"}>
                                          <td className="border px-2 py-1 text-center font-semibold">{it.q}</td>
                                          <td className="border px-2 py-1 text-center">{it.student ?? "—"}</td>
                                          <td className="border px-2 py-1 text-center">{it.correct}</td>
                                          <td className="border px-2 py-1 text-center">
                                            {it.is_correct === true ? "✓ Đúng" : it.is_correct === false ? "✗ Sai" : "? Không xác định"}
                                          </td>
                                          <td className="border px-2 py-1 text-center">{it.points.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {result.per_question.essay_steps.length > 0 && (
                                <div className="mt-3">
                                  <p className="text-sm font-semibold">Tự luận — điểm từng bước:</p>
                                  <ul className="mt-1 list-disc pl-5 text-sm">
                                    {result.per_question.essay_steps.map((s, i) => (
                                      <li key={i}>
                                        {s.step}: {s.awarded}/{s.points}đ{s.note ? ` — ${s.note}` : ""}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                        {result.feedback && <p className="mt-2 text-sm text-slate-700">{result.feedback}</p>}
                        {!result.approved && result.status === "ready" && (
                          <button
                            type="button"
                            onClick={() => void approve(result.id)}
                            className="mt-3 rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
                          >
                            Duyệt kết quả này
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    {submission.status === "queued" && "Đang chờ chấm — AI sẽ chấm ngầm trong nền, giáo viên cứ chụp tiếp bài sau."}
                    {submission.status === "grading" && "Đang chấm…"}
                    {submission.status === "error" && "Bài này chấm lỗi. Bấm “Chấm bài AI” để chấm lại."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white px-3.5 py-2 text-lg font-bold leading-none text-black hover:bg-slate-200"
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt="Ảnh đã chấm phóng to"
            className="max-h-full max-w-full rounded object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
