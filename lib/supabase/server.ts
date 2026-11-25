// Client Supabase phía server (Server Component / Route Handler):
// đọc session của người dùng từ cookie. Mẫu theo app thaoluannhom.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) {
    throw new Error("Chưa cấu hình Supabase: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Gọi từ Server Component — middleware sẽ refresh session.
        }
      },
    },
  });
}
