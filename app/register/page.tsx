"use client";

// Trang đăng ký: tên GV + email + mật khẩu (Supabase Auth).
// Đăng ký xong hệ thống gửi email xác nhận — GV bấm link trong email rồi
// đăng nhập. Tài khoản mới dùng ngay, không cần ai duyệt.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });
      if (err) {
        setError(
          err.message === "User already registered"
            ? "Email này đã đăng ký rồi. Hãy đăng nhập hoặc bấm “Quên mật khẩu”."
            : err.message,
        );
        return;
      }
      // Nếu project tắt xác nhận email thì signUp trả session luôn.
      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }
      setDone(true);
    } catch {
      setError("Không đăng ký được. Kiểm tra mạng rồi thử lại.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Kiểm tra email của bạn</h1>
        <p className="mt-2 text-sm text-slate-600">
          Hệ thống đã gửi link xác nhận tới <strong>{email}</strong>. Bấm vào link trong email
          rồi đăng nhập để bắt đầu chấm. Không thấy thư thì kiểm tra mục Spam/Quảng cáo.
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
      <h1 className="text-2xl font-bold">Tạo tài khoản giáo viên</h1>
      <p className="mt-1 text-sm text-slate-600">
        Mỗi giáo viên chỉ thấy phiên chấm của mình. Đã có tài khoản?{" "}
        <Link href="/login" className="font-semibold text-teal-800 underline">
          Đăng nhập
        </Link>
        .
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="block text-sm font-semibold">Tên giáo viên</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="vd: Nguyễn Quốc Đăng"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
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
          <label className="block text-sm font-semibold">Mật khẩu (tối thiểu 6 ký tự)</label>
          <input
            type="password"
            required
            minLength={6}
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
          {loading ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
        </button>
      </form>
    </div>
  );
}
