// POST /api/submissions — tải ảnh bài làm lên (1 bài HS = 1 nhóm 2–3 ảnh).
//
// CHẤM NGẦM: upload trả về NGAY sau khi lưu ảnh + tạo/gắn job chờ chấm —
// KHÔNG chờ AI chấm xong. Bài mới tự vào hàng chờ của job đang chạy; nếu
// không có job đang chạy thì tạo job mới (queued) cho các bài chưa chấm.
import { getSupabase, getPublicUrl, PHOTO_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function ensureJobForSession(db: ReturnType<typeof getSupabase>, sessionId: string, submissionIds: string[]) {
  // Job đang chạy (queued/processing) thì gắn bài mới vào; không có thì tạo job mới.
  const { data: active } = await db
    .from("grade_jobs")
    .select("id, total")
    .eq("session_id", sessionId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) {
    await db.from("submissions").update({ job_id: active.id }).in("id", submissionIds);
    await db
      .from("grade_jobs")
      .update({ total: (active.total as number) + submissionIds.length })
      .eq("id", active.id);
    return active.id as string;
  }
  // Không có job đang chạy: tạo job mới cho các bài chưa chấm (kể cả bài cũ chưa có job).
  const { data: ungraded } = await db
    .from("submissions")
    .select("id")
    .eq("session_id", sessionId)
    .is("job_id", null)
    .in("status", ["queued", "error"]);
  const allIds = [...new Set([...submissionIds, ...((ungraded ?? []).map((u) => u.id as string))])];
  const { data: job, error } = await db
    .from("grade_jobs")
    .insert({ session_id: sessionId, status: "queued", total: allIds.length, completed: 0, progress: 0 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("submissions").update({ job_id: job.id }).in("id", allIds);
  return job.id as string;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const sessionId = String(form.get("session_id") ?? "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!sessionId) return Response.json({ ok: false, error: "Thiếu phiên." }, { status: 400 });
    if (files.length === 0) return Response.json({ ok: false, error: "Chưa có ảnh nào." }, { status: 400 });
    if (files.length > 5) return Response.json({ ok: false, error: "Mỗi bài tối đa 5 ảnh." }, { status: 400 });
    for (const f of files) {
      if (!IMAGE_MIME.includes(f.type) && !f.type.startsWith("image/")) {
        return Response.json({ ok: false, error: `File “${f.name}” không phải ảnh.` }, { status: 400 });
      }
    }

    const db = getSupabase();
    const { data: session, error: sErr } = await db
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .single();
    if (sErr || !session) return Response.json({ ok: false, error: "Không tìm thấy phiên." }, { status: 404 });

    // Tên tạm theo thứ tự chụp ("HS 1", "HS 2"...). KHÔNG nhập tên tay:
    // AI tự đọc tên trên bài làm khi chấm và điền vào (xem submit_result).
    const { count } = await db
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    const studentName = `HS ${(count ?? 0) + 1}`;

    // Tạo dòng submission trước để có id làm đường dẫn lưu ảnh.
    const { data: sub, error: iErr } = await db
      .from("submissions")
      .insert({ session_id: sessionId, student_name: studentName, files: [], status: "queued" })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);
    const submissionId = sub.id as string;

    const stored: Array<{ name: string; url: string; kind: string; mime: string }> = [];
    for (const f of files) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `sessions/${sessionId}/${submissionId}/${Date.now()}-${safe}`;
      const buf = Buffer.from(await f.arrayBuffer());
      const { error: uErr } = await db.storage.from(PHOTO_BUCKET).upload(path, buf, {
        contentType: f.type || "image/jpeg",
        upsert: true,
      });
      if (uErr) throw new Error(`Tải ảnh “${f.name}” thất bại: ${uErr.message}`);
      stored.push({ name: f.name, url: getPublicUrl(path), kind: "image", mime: f.type });
    }
    await db.from("submissions").update({ files: stored }).eq("id", submissionId);

    // Xếp hàng chờ chấm ngầm (trả về ngay, không chờ AI).
    const jobId = await ensureJobForSession(db, sessionId, [submissionId]);
    return Response.json({ ok: true, submissionId, jobId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
