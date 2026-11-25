"use client";

// Trang đăng nhập: email + mật khẩu (Supabase Auth).
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const linkExpired = searchParams.get("error") === "link-het-han";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(linkExpired ? "Link trong email đã hết hạn. Hãy bấm gửi lại link đặt lại mật khẩu." : "");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(
          err.message === "Invalid login credentials"
            ? "Email hoặc mật khẩu chưa đúng. Kiểm tra lại rồi thử lại."
            : err.message,
        );
        return;
      }
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Không đăng nhập được. Kiểm tra mạng rồi thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Đăng nhập</h1>
      <p className="mt-1 text-sm text-slate-600">
        Đăng nhập để tạo phiên chấm và xem bài của học sinh. Chưa có tài khoản?{" "}
        <Link href="/register" className="font-semibold text-teal-800 underline">
          Đăng ký
        </Link>
        .
      </p>
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
        <div>
          <label className="block text-sm font-semibold">Mật khẩu</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="text-teal-800 underline">
            Quên mật khẩu?
          </Link>
        </p>
      </form>
    </div>
  );
}

// useSearchParams() bắt buộc phải nằm trong Suspense khi prerender.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
