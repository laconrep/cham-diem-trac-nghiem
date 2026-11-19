# Chấm điểm trắc nghiệm + tự luận bằng AI qua MCP

App riêng cho giáo viên chấm bài kiểm tra trắc nghiệm (3 phần: ABCD, Đúng/Sai,
trả lời ngắn) + tự luận, dùng AI chấm qua cổng MCP — không cần API key AI trong app.

## Luồng làm việc

1. **Tạo phiên:** tải file Word (.docx) chứa bảng đáp án — cột là mã đề, dòng là
   câu hỏi. App đọc bảng rồi hiện **tiêu chí chấm** (từng câu: đáp án đúng +
   điểm) cho giáo viên **duyệt/sửa trước**; duyệt xong mới lưu phiên.
   Có nút **“Nạp mẫu đề thi tốt nghiệp”** (P1 12 câu ABCD, P2 2 câu × 4 ý,
   P3 4 câu trả lời ngắn).
2. **Chụp bài:** màn hình chụp dùng camera của máy, mở **liên tục** — không
   đóng/mở lại giữa các bài. Mỗi bài học sinh là 1 nhóm riêng (2–3 ảnh: phiếu
   trắc nghiệm + trang tự luận). Chụp xong bấm **“Chấm xong”** để chốt nhóm đó
   vào hàng chờ chấm ngầm rồi chụp tiếp bài sau. Không dùng được camera thì
   chọn file ảnh (nhiều ảnh cùng lúc), vẫn gom theo nhóm + nút “Chấm xong”.
   **Không nhập tên HS:** AI tự đọc tên trên bài làm khi chấm và điền vào kết
   quả + file Excel; bài nào đọc không ra thì tạm hiện “HS 1”, “HS 2”…
3. **Chấm ngầm:** tải ảnh lên là xếp hàng chờ chấm ngay — giáo viên không chờ
   AI chấm xong từng bài mới chụp tiếp. Trang kết quả tự cập nhật mỗi 5 giây:
   bài nào chấm trước nằm đầu, chấm sau nằm tiếp theo (theo `graded_at` tăng
   dần). Trạng thái từng bài hiện rõ: đang chờ chấm / đang chấm / đã chấm
   xong / lỗi.
4. **Kết quả:** ảnh đã chấm (khoanh **xanh lá** = chọn đúng, **đỏ** = chọn sai,
   **vàng** = đáp án đúng của câu sai), điểm trắc nghiệm / tự luận / tổng,
   bảng đúng/sai từng câu, điểm từng bước tự luận. Giáo viên duyệt từng kết quả.
5. **Xuất Excel:** nút xuất bảng điểm phiên (.xlsx) — 4 sheet theo thiết kế của
   repo tham khảo.

## Chấm bằng AI (MCP)

- App có cổng MCP `/api/mcp` (JSON-RPC qua HTTP, Bearer `AI_WORKER_TOKEN`,
  fail-closed: thiếu hoặc ngắn hơn 8 ký tự thì cổng đóng với 503).
- Tools: `list_pending_jobs`, `claim_job` (nguyên tử), `get_job` (đáp án đã
  duyệt + barem tự luận + URL ảnh bài nộp), `set_progress`,
  `set_submission_status`, `submit_result`, `fail_job`.
- Worker AI (trợ lý) nhận job → đọc ảnh → đối chiếu đáp án theo mã đề trên
  phiếu → chấm trắc nghiệm + tự luận → tự tô khoanh lên ảnh → nộp kết quả về.
- Quy trình chấm chi tiết: xem `GRADE_PROTOCOL.md`.

## Cài đặt

```bash
cp .env.example .env.local   # điền NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_WORKER_TOKEN
npm install
npm run dev                  # http://localhost:3000
```

Chạy migration `supabase/migrations/001_init.sql` trên project Supabase
(bằng SQL Editor — service key không chạy DDL được). Migration tạo các bảng
`sessions`, `submissions`, `grade_jobs`, `grade_results` và bucket `cham-diem`.

## Ghi nguồn

Ý tưởng + thiết kế Excel tham khảo dự án
[cham-diem-hoc-sinh](https://github.com/sanginnova/cham-diem-hoc-sinh) của
**ThS. Nguyễn Văn Sang** (được tác giả cho phép khai thác). Thang điểm P2
theo thang của Bộ {0:0, 1:0,1, 2:0,25, 3:0,5, 4:1,0}; P1 đúng × 0,25;
P3 đúng × 0,5.
