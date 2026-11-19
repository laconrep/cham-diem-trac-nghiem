# Quy trình chấm cho app chấm điểm trắc nghiệm (dự thảo — chờ bác chốt phạm vi v1)

Áp dụng cho job chấm của app riêng. Kế thừa quy trình chấm song song của
thaoluannhom (`~/hooks/ai-grade-dispatch-protocol.md`): bài nào độc lập bài đó →
chia luồng ngay từ đầu, không chấm nối tiếp. Khác biệt chính: chấm qua **MCP
endpoint của app riêng** (không dùng bảng `ai_grade_jobs` của thaoluannhom),
và chấm cả trắc nghiệm + tự luận + tự tô khoanh lên ảnh.

## Luồng tổng thể (một job)

1. GV tạo phiên → tải file Word đáp án → app đọc bảng → hiện tiêu chí chấm
   cho GV duyệt/sửa → GV duyệt xong → HS nộp ảnh (2–3 ảnh/HS: 1 phiếu trắc
   nghiệm + 1–2 trang tự luận) → GV bấm "Chấm bài AI" → app tạo job `queued`.
2. Trợ lý (qua MCP) `list_pending_jobs` → `claim_job` (nguyên tử) → `get_job`
   → nhận: đáp án đã duyệt (theo mã đề), barem tự luận, URL ảnh từng bài nộp.
3. Main agent fan-out trực tiếp các agent chấm (job đơn — bỏ coordinator,
   theo bài học 18/10): mỗi agent 1 bài (N ≤ 15; N > 15 chia đều).
4. Mỗi agent chấm xong → nộp kết quả qua MCP `submit_result` (xem mẫu dưới).
   Main agent giám sát tiến độ → đủ số bài thì job `done`.
5. App hiển thị ảnh đã chấm + bảng điểm; GV duyệt; nút xuất Excel.

## MCP tools của app riêng (đề xuất, theo mẫu EduSync `app/api/mcp/route.ts`)

- `list_pending_jobs` — liệt kê job đang chờ.
- `claim_job` — nhận 1 job (nguyên tử).
- `get_job` — chi tiết job: đáp án đã duyệt (JSON: mã đề → từng câu → đáp án
  đúng + điểm), barem tự luận, danh sách bài nộp (id + URL ảnh).
- `set_progress` — tiến độ 0–100 + nhãn giai đoạn.
- `submit_result` — nộp kết quả 1 bài: điểm từng phần, kết quả từng câu
  trắc nghiệm (câu, đáp án HS, đáp án đúng, đúng/sai, điểm), nhận xét tự luận
  theo bước, **URL ảnh đã chấm** (xem mục Ảnh chấm).
- `fail_job` — báo job/bài không xử lý được + lý do.

Bảo mật: Bearer `AI_WORKER_TOKEN` (fail-closed < 8 ký tự → 503), header
`X-Worker-Id`. Mọi thao tác qua hàm nghiệp vụ, không gọi DB trực tiếp từ route.

## Bước chấm của mỗi agent (mẫu brief)

```
Chấm bài nộp được giao cho job {job_id}. Làm trực tiếp, không tạo subagent con.
Lấy job qua MCP get_job → đáp án đã duyệt + barem tự luận + URL ảnh.

Với MỖI bài nộp được giao:
1. Tải TẤT CẢ ảnh (2–3 ảnh/HS). Ảnh có thể xoay — xoay bằng PIL trước khi đọc.
   File .heic → `heif-convert`. Ảnh chụp hay bị mờ/nghiêng: đọc kỹ, đối chiếu
   các ảnh với nhau trước khi kết luận. BẮT BUỘC xem hết mọi ảnh rồi mới chấm.
2. Tự phát hiện loại ảnh: ảnh nào là phiếu trắc nghiệm, ảnh nào là trang tự luận.
3. Phiếu trắc nghiệm:
   - Đọc mã đề trên phiếu → lấy đúng cột mã đề trong đáp án đã duyệt.
     Không thấy mã đề: nếu đáp án chỉ có 1 mã đề thì dùng cột đó, còn không thì
     ghi error "không đọc được mã đề".
   - Đọc từng ô đã tô (Phần I ABCD, Phần II Đúng/Sai từng ý, Phần III trả lời ngắn).
     Tô 2 ô / tẩy xóa không rõ → ghi câu đó là "không xác định", 0 điểm, ghi chú rõ.
   - Đối chiếu đáp án → đúng/sai từng câu → tính điểm theo thang đã duyệt
     (mặc định mẫu thi tốt nghiệp: P1 đúng × 0,25; P2 thang Bộ {0:0, 1:0,1,
     2:0,25, 3:0,5, 4:1,0}; P3 đúng × 0,5 — lấy từ tiêu chí đã duyệt, không tự bịa).
4. Tự luận: chấm theo barem đã duyệt, ghi điểm từng bước
   (+0,25đ [✓] / 0,00đ [✗]) + highlight vàng chỗ sai (xem mục Ảnh chấm).
5. Vẽ ảnh chấm (xem mục Ảnh chấm) → tải lên storage → lấy URL.
6. Nộp kết quả qua MCP submit_result: điểm trắc nghiệm, điểm tự luận, tổng điểm,
   kết quả từng câu trắc nghiệm, nhận xét tự luận theo bước, URL ảnh đã chấm.
   Mọi bài đều phải có kết quả (lỗi → fail_job với lý do tiếng Việt).
```

## Ảnh chấm (tự tô khoanh)

- Vẽ lên **bản sao** ảnh gốc (không sửa ảnh HS nộp), bằng PIL.
- Trắc nghiệm: khoanh **xanh lá** ô HS chọn đúng; **đỏ** ô HS chọn sai;
  **vàng** ô đáp án đúng của câu HS chọn sai.
- Tự luận: điểm từng bước dóng ở lề phải (+0,25đ [✓] / 0,00đ [✗]),
  highlight vàng chỗ sai — theo mẫu `tao_bo_anh_da_cham.py` của repo tham khảo
  (class VietnameseAnnotator, PIL ImageDraw, highlight alpha 0.40).
- Tọa độ ô: xác định bằng mắt (visual grounding) trên ảnh đã xoay đúng hướng.
  Phiếu nào dò không ra lưới ô rõ ràng → KHÔNG khoanh bừa: nộp ảnh gốc + bảng
  đúng/sai từng câu trong kết quả để app hiện thay.
- Tải ảnh đã chấm lên storage của app (đề xuất: dùng chung Supabase storage
  project supabase-emerald-car, bucket riêng — theo đúng pattern ký signed URL
  của thaoluannhom: URL-encode từng đoạn path riêng, giữ nguyên `/`).
- Mỗi agent dùng thư mục /tmp riêng (`/tmp/grade-<job8>-a<N>/`) — bài học 08/11.

## Xuất Excel (app làm, không phải agent)

- Nút xuất bảng điểm phiên (.xlsx) bằng ExcelJS, theo thiết kế 4 sheet của
  `cham_diem_core.py`: "Bảng Điểm Chi Tiết", "Đối Chiếu Bài Làm Chi Tiết",
  "Thống Kê Phổ Điểm", "Đáp Án & Barem Điểm Chuẩn". Logic chấm thuần + template
  feedback port từ file này. Ghi nguồn tác giả ThS. Nguyễn Văn Sang trong code.

## Bài học kế thừa từ thaoluannhom (đừng lặp lại)

- Mỗi agent 1 thư mục /tmp riêng; PATCH lỗi mạng → GET đọc lại trước khi PATCH lại.
- Đa số file bài nộp nằm trên B2, URL đã ký sẵn — tải trực tiếp, không ký lại.
- Ảnh hay xoay — PIL xoay trước khi đọc.
- Kiểm job xong PHẢI đọc luôn nội dung feedback, không chỉ điểm/trạng thái.
- Monitor đếm cả `approved` vào số hoàn thành (ready+approved+error == total mới done).
