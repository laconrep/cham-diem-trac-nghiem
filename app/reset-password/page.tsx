"use client";

// Trang đặt mật khẩu mới: mở từ link trong email (qua /auth/callback, lúc
// này đã có session khôi phục) → đặt mật khẩu mới → về trang đăng nhập.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Hai mật khẩu chưa khớp.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        return;
      }
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setError("Không đặt được mật khẩu mới. Link có thể đã hết hạn — hãy gửi lại link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Đặt mật khẩu mới</h1>
      <p className="mt-1 text-sm text-slate-600">Nhập mật khẩu mới cho tài khoản của bạn.</p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="block text-sm font-semibold">Mật khẩu mới (tối thiểu 6 ký tự)</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold">Nhập lại mật khẩu mới</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? "Đang lưu…" : "Đổi mật khẩu & đăng nhập lại"}
        </button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-teal-800 underline">
            Quay lại đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}
