// Trang Quản lý tài khoản (chỉ admin): liệt kê giáo viên đã đăng ký và
// chấm dứt tài khoản khi cần. Spec v2, bác chốt 20/11.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import TerminateButton from "@/components/TerminateButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) {
    return (
      <div>
        <p className="text-red-700">Trang này chỉ dành cho quản trị.</p>
        <Link href="/" className="text-teal-800 underline">Về trang chủ</Link>
      </div>
    );
  }
  const db = getSupabase();
  const { data: usersData, error } = await db.auth.admin.listUsers({ perPage: 100 });
  if (error) {
    return <p className="text-red-700">Không tải được danh sách tài khoản: {error.message}</p>;
  }
  const users = usersData?.users ?? [];

  // Đếm phiên chấm theo chủ phiên để admin đối chiếu.
  const { data: sessions } = await db.from("cdtn_sessions").select("owner_id");
  const sessionCount = new Map<string, number>();
  for (const s of sessions ?? []) {
    const owner = s.owner_id as string | null;
    if (owner) sessionCount.set(owner, (sessionCount.get(owner) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Quản lý tài khoản</h1>
      <p className="mt-1 text-sm text-slate-600">
        {users.length} tài khoản giáo viên đã đăng ký. Chấm dứt tài khoản thì giáo viên đó không
        đăng nhập được nữa; phiên chấm của họ vẫn giữ lại để đối chiếu (chỉ quản trị thấy).
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-left text-white">
              <th className="border px-3 py-2">Giáo viên</th>
              <th className="border px-3 py-2">Email</th>
              <th className="border px-3 py-2">Đăng ký lúc</th>
              <th className="border px-3 py-2">Lần đăng nhập cuối</th>
              <th className="border px-3 py-2">Số phiên</th>
              <th className="border px-3 py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const name = ((u.user_metadata ?? {}) as { full_name?: string }).full_name?.trim() || "—";
              const isSelf = u.id === user.id;
              return (
                <tr key={u.id} className="odd:bg-white even:bg-slate-50">
                  <td className="border px-3 py-2 font-semibold">
                    {name}
                    {isSelf ? " (bạn — quản trị)" : ""}
                  </td>
                  <td className="border px-3 py-2">{u.email ?? "—"}</td>
                  <td className="border px-3 py-2">
                    {u.created_at ? new Date(u.created_at).toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="border px-3 py-2">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("vi-VN") : "Chưa đăng nhập"}
                  </td>
                  <td className="border px-3 py-2 text-center">{sessionCount.get(u.id) ?? 0}</td>
                  <td className="border px-3 py-2">
                    {isSelf ? (
                      <span className="text-xs text-slate-400">Tài khoản quản trị</span>
                    ) : (
                      <TerminateButton userId={u.id} email={u.email ?? ""} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {users.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">Chưa có tài khoản nào.</p>
      )}
    </div>
  );
}
