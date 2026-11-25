// POST /api/parse-answer — đọc file Word (.docx) chứa bảng đáp án, trả về
// tiêu chí chấm (câu, đáp án đúng theo mã đề, điểm) để GV duyệt/sửa TRƯỚC
// khi tạo phiên. Chưa lưu gì vào DB ở bước này. Cần đăng nhập (bất kỳ GV nào).
import { parseAnswerDocx } from "@/lib/answer-key";
import { requireApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "Thiếu file Word (.docx)." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return Response.json({ ok: false, error: "File phải là Word (.docx)." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const res = await parseAnswerDocx(buf);
    return Response.json({
      ok: true,
      answerKey: res.answerKey,
      warnings: res.warnings,
      tablesFound: res.tablesFound,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không đọc được file Word.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
