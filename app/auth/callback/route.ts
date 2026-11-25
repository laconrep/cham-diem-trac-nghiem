// GET /auth/callback — Supabase Auth chuyển về đây sau khi GV bấm link
// trong email (xác nhận đăng ký / đặt lại mật khẩu). Đổi code lấy session
// rồi chuyển về trang đích (?next=).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }
  // Code sai/hết hạn: về trang đăng nhập kèm báo lỗi.
  return NextResponse.redirect(`${origin}/login?error=link-het-han`);
}
