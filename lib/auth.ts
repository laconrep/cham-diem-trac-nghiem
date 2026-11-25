// Quyền truy cập app chấm điểm (spec v2, bác chốt 20/11).
//
// - Mỗi giáo viên chỉ thấy phiên của mình (cột cdtn_sessions.owner_id).
// - Admin xác định THEO EMAIL ghi trong code (không đụng user_metadata /
//   app_metadata vì tài khoản admin dùng chung auth với app thaoluannhom).
// - Admin thấy tất cả phiên + có trang Quản lý tài khoản để chấm dứt
//   tài khoản GV (xóa auth user; phiên của GV đó giữ lại để admin đối chiếu).
// - Dữ liệu đọc qua service key (bảng chưa bật RLS — như kiến trúc hiện
//   tại của app) và lọc theo owner_id trong code. Cổng MCP không qua đây.
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export const ADMIN_EMAILS = ["gagabux95@gmail.com"];

export function isAdmin(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export function displayName(user: User): string {
  const meta = (user.user_metadata ?? {}) as { full_name?: string };
  return meta.full_name?.trim() || user.email || "Giáo viên";
}

/** Người dùng hiện tại (đọc session từ cookie). Null nếu chưa đăng nhập. */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

/** Dùng trong API route: chưa đăng nhập → Response 401. */
export async function requireApiUser(): Promise<{ user: User } | { response: Response }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: Response.json({ ok: false, error: "Chưa đăng nhập. Hãy đăng nhập rồi thử lại." }, { status: 401 }),
    };
  }
  return { user };
}

export interface SessionAccess {
  allowed: boolean;
  ownerId: string | null;
}

/** GV có được xem/sửa phiên này không? Admin được tất cả; GV chỉ phiên mình tạo. */
export async function checkSessionAccess(sessionId: string, user: User): Promise<SessionAccess> {
  if (isAdmin(user)) return { allowed: true, ownerId: null };
  const db = getSupabase();
  const { data } = await db.from("cdtn_sessions").select("owner_id").eq("id", sessionId).maybeSingle();
  if (!data) return { allowed: false, ownerId: null };
  const ownerId = (data.owner_id as string | null) ?? null;
  return { allowed: ownerId !== null && ownerId === user.id, ownerId };
}

/** Phiên của 1 bài nộp (dùng cho duyệt kết quả): qua submission → session. */
export async function checkResultAccess(resultId: string, user: User): Promise<boolean> {
  if (isAdmin(user)) return true;
  const db = getSupabase();
  const { data: result } = await db
    .from("cdtn_grade_results")
    .select("submission_id")
    .eq("id", resultId)
    .maybeSingle();
  if (!result) return false;
  const { data: sub } = await db
    .from("cdtn_submissions")
    .select("session_id")
    .eq("id", result.submission_id as string)
    .maybeSingle();
  if (!sub) return false;
  const access = await checkSessionAccess(sub.session_id as string, user);
  return access.allowed;
}

/** Response 403 chuẩn cho API route khi không có quyền xem phiên. */
export function forbiddenResponse(): Response {
  return Response.json(
    { ok: false, error: "Bạn không có quyền xem phiên này (phiên thuộc giáo viên khác)." },
    { status: 403 },
  );
}
