import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser, isAdmin, displayName } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "Chấm điểm trắc nghiệm + tự luận",
  description:
    "Chấm bài trắc nghiệm và tự luận bằng AI qua MCP: đáp án Word theo mã đề, khoanh xanh/đỏ/vàng trên ảnh bài làm, xuất Excel.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <a href="/" className="text-lg font-bold text-teal-800">
              Chấm điểm trắc nghiệm + tự luận
            </a>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline">
                Chấm bằng AI qua MCP · Không cần key AI
              </span>
              {user && (
                <>
                  {isAdmin(user) && (
                    <Link
                      href="/admin"
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      Quản lý tài khoản
                    </Link>
                  )}
                  <span className="text-xs font-semibold text-slate-700" title={user.email}>
                    {displayName(user)}
                    {isAdmin(user) ? " (quản trị)" : ""}
                  </span>
                  <LogoutButton />
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-400">
          Ý tưởng + thiết kế Excel tham khảo dự án cham-diem-hoc-sinh của ThS. Nguyễn Văn Sang
          (được tác giả cho phép khai thác).
        </footer>
      </body>
    </html>
  );
}
