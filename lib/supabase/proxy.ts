// Middleware: refresh session Supabase + chặn trang cần đăng nhập.
// Mẫu theo app thaoluannhom (lib/supabase/proxy.ts), chỉnh lại cho app
// chấm điểm: mọi trang đều cần đăng nhập, trừ /login, /register,
// /forgot-password, /reset-password, /auth/*.
//
// LƯU Ý: matcher ở middleware.ts loại /api/* ra — các API route tự kiểm
// tra đăng nhập/quyền bên trong (xem lib/auth.ts). Cổng MCP (/api/mcp)
// dùng Bearer AI_WORKER_TOKEN riêng, không dùng session người dùng.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

function isPublic(path: string): boolean {
  if (path.startsWith("/auth/")) return true;
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // Chưa cấu hình Supabase thì để trang tự báo lỗi cấu hình.
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    // Session hỏng/hết hạn: coi như chưa đăng nhập, không làm sập routing.
  }

  const path = request.nextUrl.pathname;
  const isServerAction = request.headers.has("next-action");

  // Chưa đăng nhập mà vào trang cần đăng nhập → về /login (giữ ?next= để
  // đăng nhập xong quay lại đúng trang). Server Action POST không redirect
  // (tránh lỗi "Server Action was not found" của Next).
  if (!user && !isPublic(path) && !isServerAction) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // Đã đăng nhập mà vào /login hoặc /register → về trang chủ.
  if (user && (path === "/login" || path === "/register")) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}
