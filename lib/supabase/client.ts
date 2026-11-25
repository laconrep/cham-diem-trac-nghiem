// Client Supabase cho trình duyệt (đăng nhập / đăng ký / quên mật khẩu).
// Dùng anon key công khai + @supabase/ssr để session lưu vào cookie,
// phía server đọc lại được. Mẫu theo app thaoluannhom.
import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) {
    throw new Error("Chưa cấu hình Supabase: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  _client = createBrowserClient(url, key);
  return _client;
}
