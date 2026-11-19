import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chấm điểm trắc nghiệm + tự luận",
  description:
    "Chấm bài trắc nghiệm và tự luận bằng AI qua MCP: đáp án Word theo mã đề, khoanh xanh/đỏ/vàng trên ảnh bài làm, xuất Excel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-bold text-teal-800">
              Chấm điểm trắc nghiệm + tự luận
            </a>
            <span className="text-xs text-slate-500">Chấm bằng AI qua MCP · Không cần key AI</span>
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
