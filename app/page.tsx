import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!supabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-bold text-amber-900">Chưa cấu hình Supabase</h1>
        <p className="mt-2 text-sm text-amber-800">
          App cần biến môi trường <code>NEXT_PUBLIC_SUPABASE_URL</code> và{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>. Sao chép <code>.env.example</code> thành{" "}
          <code>.env.local</code> rồi điền giá trị, chạy migration{" "}
          <code>supabase/migrations/001_init.sql</code> rồi tải lại trang.
        </p>
      </div>
    );
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getSupabase();
  // Giáo viên chỉ thấy phiên của mình; admin thấy tất cả.
  let query = db
    .from("cdtn_sessions")
    .select("id, title, status, owner_id, created_at")
    .order("created_at", { ascending: false });
  if (!isAdmin(user)) query = query.eq("owner_id", user.id);
  const { data: sessions } = await query;

  // Admin: hiện email chủ phiên (tra từ danh sách tài khoản).
  let ownerEmail = new Map<string, string>();
  if (isAdmin(user)) {
    const { data: users } = await db.auth.admin.listUsers({ perPage: 100 });
    for (const u of users?.users ?? []) ownerEmail.set(u.id, u.email ?? "");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Các phiên chấm</h1>
          <p className="mt-1 text-sm text-slate-600">
            Mỗi phiên: tải file Word đáp án → duyệt tiêu chí chấm → chụp bài học sinh → AI chấm
            ngầm → xuất Excel.
            {isAdmin(user) ? " Bạn đang xem với quyền quản trị (thấy phiên của mọi giáo viên)." : ""}
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          + Tạo phiên mới
        </Link>
      </div>
      {!sessions || sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          Chưa có phiên nào. Bấm “Tạo phiên mới” để bắt đầu.
        </div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id as string} className="rounded-lg border border-slate-200 bg-white p-4">
              <Link href={`/sessions/${s.id as string}`} className="block">
                <span className="text-base font-semibold text-teal-800 hover:underline">
                  {s.title as string}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Tạo lúc {new Date(s.created_at as string).toLocaleString("vi-VN")}
                  {isAdmin(user) && s.owner_id
                    ? ` · Chủ phiên: ${ownerEmail.get(s.owner_id as string) ?? s.owner_id}`
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
