"use client";

// Trang quên mật khẩu: nhập email → hệ thống gửi link đặt lại mật khẩu.
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (err) {
        setError(err.message);
        return;
      }
      setDone(true);
    } catch {
      setError("Không gửi được email. Kiểm tra mạng rồi thử lại.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Kiểm tra email của bạn</h1>
        <p className="mt-2 text-sm text-slate-600">
          Nếu <strong>{email}</strong> đã đăng ký, hệ thống vừa gửi link đặt lại mật khẩu tới
          địa chỉ này. Bấm vào link trong email để đặt mật khẩu mới. Không thấy thư thì kiểm tra
          mục Spam/Quảng cáo.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="font-semibold text-teal-800 underline">
            Về trang đăng nhập
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Quên mật khẩu</h1>
      <p className="mt-1 text-sm text-slate-600">Nhập email đã đăng ký để nhận link đặt lại mật khẩu.</p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="block text-sm font-semibold">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vd: gv@truong.edu.vn"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? "Đang gửi…" : "Gửi link đặt lại mật khẩu"}
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
