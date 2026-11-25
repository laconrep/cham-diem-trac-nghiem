"use client";

// Nút đăng xuất ở header: xóa session Supabase rồi về trang đăng nhập.
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      Đăng xuất
    </button>
  );
}
