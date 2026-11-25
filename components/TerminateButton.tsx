"use client";

// Nút chấm dứt tài khoản GV trên trang quản trị: hỏi xác nhận rồi gọi
// server action xóa tài khoản. Tài khoản bị xóa không đăng nhập lại được.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { terminateAccount } from "@/app/admin/actions";

export default function TerminateButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    if (
      !window.confirm(
        `Chấm dứt tài khoản ${email}?\n\nTài khoản này sẽ không đăng nhập được nữa. Phiên chấm của giáo viên này vẫn giữ lại để đối chiếu.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const res = await terminateAccount(userId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Không chấm dứt được tài khoản.");
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Đang xử lý…" : "Chấm dứt tài khoản"}
      </button>
      {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
    </span>
  );
}
