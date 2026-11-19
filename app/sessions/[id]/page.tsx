import Link from "next/link";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import SessionWorkbench from "@/components/SessionWorkbench";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!supabaseConfigured()) {
    return <p className="text-amber-800">Chưa cấu hình Supabase. Xem .env.example.</p>;
  }
  const db = getSupabase();
  const { data: session, error } = await db.from("sessions").select("*").eq("id", id).single();
  if (error || !session) {
    return (
      <div>
        <p className="text-red-700">Không tìm thấy phiên.</p>
        <Link href="/" className="text-teal-800 underline">Về trang chủ</Link>
      </div>
    );
  }
  const answerKey = session.answer_key as { codes?: string[]; questions?: unknown[] } | null;
  return (
    <div>
      <div className="mb-4">
        <Link href="/" className="text-sm text-teal-800 underline">← Về danh sách phiên</Link>
        <h1 className="mt-1 text-2xl font-bold">{session.title as string}</h1>
        <p className="text-sm text-slate-600">
          Mã đề: {(answerKey?.codes ?? []).join(", ") || "—"} ·{" "}
          {(answerKey?.questions ?? []).length} câu đã duyệt · Tạo lúc{" "}
          {new Date(session.created_at as string).toLocaleString("vi-VN")}
        </p>
      </div>
      <SessionWorkbench sessionId={id} sessionTitle={session.title as string} />
    </div>
  );
}
