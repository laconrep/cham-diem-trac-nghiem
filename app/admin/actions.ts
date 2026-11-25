// Server Action: admin chấm dứt tài khoản GV (xóa auth user).
// Tài khoản bị chấm dứt không đăng nhập được nữa; phiên chấm của GV đó
// vẫn giữ lại trong DB để admin đối chiếu (chỉ admin thấy).
"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export async function terminateAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return { ok: false, error: "Chỉ quản trị mới được chấm dứt tài khoản." };
  }
  if (userId === user.id) {
    return { ok: false, error: "Không thể chấm dứt chính tài khoản quản trị đang dùng." };
  }
  const db = getSupabase();
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
