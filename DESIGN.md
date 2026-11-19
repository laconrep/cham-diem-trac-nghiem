# Dự án riêng: Chấm điểm trắc nghiệm + tự luận (app riêng, tách khỏi thaoluannhom)

Trạng thái: SPEC ĐÃ CHỐT (19/11/2026). Chờ bác chốt tên repo + phạm vi v1.

## Spec đã chốt (6 phần + bổ sung)

1. **Phạm vi:** phiên cá nhân (Giao việc cá nhân). HS nộp 2–3 ảnh: 1 phiếu trắc nghiệm + 1–2 trang tự luận.
2. **Tự phát hiện phiếu trắc nghiệm:** app/trợ lý tự nhận biết ảnh nào là phiếu trắc nghiệm, ảnh nào là tự luận (không cần GV khai báo loại bài).
3. **Đáp án:** GV tải file **Word (.docx)** chứa bảng đáp án — cột là mã đề, dòng là câu hỏi. App đọc bảng trong file Word → hiện **tiêu chí chấm** (từng câu: đáp án đúng + điểm) cho GV **duyệt/sửa trước**, duyệt xong mới bắt đầu chấm. Khi chấm: đọc mã đề trên phiếu HS → lấy đúng cột mã đề đó để đối chiếu.
4. **Chấm trắc nghiệm (3 phần: ABCD, Đúng/Sai, trả lời ngắn):** AI đọc ô đã tô → đối chiếu đáp án → tính điểm, feedback từng câu đúng/sai.
5. **Chấm tự luận (1 phần):** theo barem, ghi chú lên ảnh giống repo tham khảo (điểm từng bước +0,25đ [✓] / 0,00đ [✗], highlight vàng chỗ sai).
6. **Ảnh chấm:** khoanh **xanh lá** = HS chọn đúng, **đỏ** = HS chọn sai, **vàng** = đáp án đúng của câu đó (khoanh ở ô đáp án đúng).
7. **Xuất Excel:** nút xuất bảng điểm phiên (điểm từng HS + đúng/sai từng câu), theo thiết kế 4 sheet của repo tham khảo.
8. **Luồng xử lý:** HS chụp ảnh nhiều mẫu khác nhau → ảnh đưa về trợ lý (chat-as-grader) tự phân tích + chấm + tự tô khoanh lên ảnh rồi trả lại cho app hiển thị. Trợ lý xác định tọa độ ô trên ảnh bằng mắt (visual grounding) rồi vẽ khoanh bằng PIL lên bản sao ảnh.
9. **Mẫu phiếu KHÔNG cố định** — không có phiếu chuẩn in sẵn; tự phát hiện + khoanh phải làm được trên phiếu bất kỳ (dò lưới khi được, không dò được thì hiện bảng đúng/sai thay vì khoanh bừa).
10. **Điểm:** GV tự nhập linh hoạt + nút nạp sẵn mẫu đề thi tốt nghiệp (Phần I 12 câu ABCD, Phần II Đúng/Sai, Phần III trả lời ngắn).

## Kiến trúc đã chốt (19/11 ~16:55)

- **AI chấm bài chạy qua MCP giống thaoluannhom** — KHÔNG cần API key AI trong app.
- App riêng có **MCP endpoint + bảng job chấm**; trợ lý chạy chấm qua MCP.
- **Repo tham khảo:** sanginnova/cham-diem-hoc-sinh (tác giả ThS. Nguyễn Văn Sang ĐÃ CHO PHÉP khai thác code — ghi nguồn/tác giả trong code). Clone tại `~/workspace/repos/cham-diem-hoc-sinh`.
  - Dùng được nhất: `cham_diem_core.py` (Excel 4 sheet + logic chấm thuần + template feedback, port sang TypeScript/ExcelJS).
  - `tao_bo_anh_da_cham.py`: mẫu vẽ PIL + ngữ nghĩa màu làm bước sau-chấm.
  - `SmartOMR_12_v19_Fixed.html`: OMR hình học — KHÔNG cần cho v1 (Muse vision đã đọc được ô tô).
  - KHÔNG lấy: dữ liệu 29 HS lớp 12B1, đáp án Toán mã 101–104/201–204, tọa độ hardcode, đường dẫn Windows, luồng Gemini key/Drive/PeerJS; "gemini-3.8-flash" là tên model không thật.
  - Thang điểm P2 của họ: {0:0, 1:0.1, 2:0.25, 3:0.5, 4:1.0}; P1 = đúng × 0,25; P3 = đúng × 0,5.

## Mẫu MCP endpoint (tham chiếu EduSync — đã đọc 19/11)

File: `~/workspace/repos/ontapsinhhoc2026/app/api/mcp/route.ts` (271 dòng) + `lib/ai/jobs.ts`.
- JSON-RPC qua HTTP POST; Bearer `AI_WORKER_TOKEN` (fail-closed: chưa đặt hoặc < 8 ký tự → 503 "Cổng MCP chưa mở hoặc sai khóa"); header `X-Worker-Id` (mặc định "muse-main").
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`; notification → 202.
- Tools mẫu: `list_pending_jobs`, `claim_job` (nguyên tử), `get_job`, `report_detection`, `set_progress`, `submit_result`, `submit_text_result`, `fail_job`, `get_textbook_excerpt`.
- Mọi thao tác qua hàm nghiệp vụ trong `lib/ai/jobs.ts`, không gọi DB trực tiếp từ route.
- Client của trợ lý: `~/workspace/custom-connectors/custom.edusync-mcp/bin/client.py`.
- Tools cho app mới (đề xuất): `list_pending_jobs`, `claim_job`, `get_job` (đáp án đã duyệt + URL ảnh bài nộp), `set_progress`, `submit_result` (kết quả từng câu + điểm + URL ảnh đã chấm), `fail_job`.

## Deploy

- Repo mới trên GitHub của bác (laconrep). Tên đề xuất: `cham-diem-trac-nghiem` (chưa chốt; đã kiểm chứng 19/11: tên này chưa tồn tại — 404).
- Token GitHub còn hiệu lực (kiểm chứng 19/11: auth 200). Giữ `~/workspace/user/files/token_github.txt` (0600).
- **v0.app:** không có connector/API v0 trực tiếp → deploy qua trình duyệt bằng tài khoản Vercel của bác (duchandiadu5@gmail.com đã đăng nhập sẵn trên trình duyệt). v0 **import được repo GitHub sẵn có** ("Import from GitHub" ở prompt bar; v0 làm trên branch riêng + PR, không push thẳng main; deploy lên Vercel). Vercel connector hiện **chưa nối** (status: not_connected) nên không deploy bằng connector được.
- Lưu ý: v0 làm việc trên branch + PR — code chính trên main do em push vẫn nguyên; thay đổi của v0 đi qua PR.

11. **Thứ tự hiển thị:** bài HS đã chấm hiển thị theo thứ tự chấm — bài nào chấm trước nằm đầu, chấm sau nằm tiếp theo (sắp xếp theo thời gian chấm xong `graded_at` tăng dần).
12. **Chụp liên tục, chấm ngầm:** GV chụp ảnh liên tục theo từng bài — tải ảnh lên là xếp hàng chờ chấm ngay, AI chấm ngầm trong nền, GV **không chờ** chấm xong từng bài mới chụp tiếp. Tải ảnh và chấm tách rời: upload trả về ngay sau khi xếp hàng; kết quả hiện dần theo thứ tự chấm xong.
13. **Màn hình chụp — tách riêng từng bài chấm:** mỗi bài HS là 1 nhóm riêng (ảnh các bài không lẫn nhau). **Camera mở liên tục, không đóng/mở lại giữa các bài.** Chụp xong 2–3 ảnh của HS1 → bấm nút **"Chấm xong"** để chốt bài HS1 (đưa vào hàng chờ chấm ngầm) → chuyển sang HS2, chụp tiếp. Nút "Chấm xong" là điểm phân tách giữa các bài.
14. **Không nhập tên HS:** GV không gõ tên — **AI tự đọc tên HS viết trên bài làm và điền vào file kết quả** (bảng điểm/Excel xuất ra). Bài nào đọc không ra tên thì tạm hiện "HS 1", "HS 2"... theo thứ tự chụp.

## Còn chờ bác chốt

1. Tên repo: `cham-diem-trac-nghiem`?
2. Phạm vi v1: công cụ cho 1 giáo viên dùng (tải đáp án Word, duyệt tiêu chí, tải ảnh bài HS, chấm, khoanh màu, xuất Excel) — chưa có tài khoản HS/lớp như thaoluannhom.

## Trở ngại 19/11 ~16:58

- **Tạo repo qua API THẤT BẠI (403 "Resource not accessible by personal access token"):** token GitHub đã lưu chỉ có quyền push vào repo hiện có, KHÔNG có quyền tạo repo mới. Cách gỡ: bác tạo repo trống `cham-diem-trac-nghiem` trên github.com (1 phút) rồi em push code lên; hoặc bác gửi token mới có quyền tạo repo qua kho bảo mật.
