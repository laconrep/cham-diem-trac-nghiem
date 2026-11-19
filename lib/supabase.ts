import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Truy cập Supabase phía server bằng service key. KHÔNG hardcode key:
// đọc từ biến môi trường. Client được tạo lười (lazy) để `next build`
// không nổ khi chưa cấu hình env.
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "Chưa cấu hình Supabase: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Xem .env.example."
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getPublicUrl(path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${url}/storage/v1/object/public/cham-diem/${path}`;
}

export const PHOTO_BUCKET = "cham-diem";
