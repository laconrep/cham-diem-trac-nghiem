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
  theo bước, **URL ảnh trắc nghiệm đã chấm + URL ảnh tự luận đã chấm**
  (annotatedImageUrl + annotatedEssayImageUrl, xem mục Ảnh chấm).
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
4. Tự luận: chấm theo barem đã duyệt, ghi điểm từng bước + highlight vàng
   chỗ sai (xem mục Ảnh chấm). **Thang điểm tự luận nhỏ nhất là 0,25đ (bác
   chốt 20/11): điểm mỗi bước CHỈ được là bội số của 0,25 (0 / 0,25 / 0,5 / …)
   và không vượt điểm tối đa của bước — bước 0,25đ chỉ được 0 hoặc 0,25
   (không cho nửa bước 0,125đ); bước 0,5đ chỉ được 0 / 0,25 / 0,5. Tuyệt đối
   không cho 0,125đ, 0,375đ hay bất kỳ giá trị lẻ nào khác.** App cũng chuẩn
   hoá lại ở cổng nộp kết quả, nhưng agent phải cho đúng ngay từ đầu để khung
   ghi chú trên ảnh khớp với điểm đã lưu.
5. Vẽ ảnh chấm (xem mục Ảnh chấm) → tải lên storage CẢ 2 ảnh (trắc nghiệm
   annotated-1.jpg + tự luận annotated-2.jpg) → lấy 2 URL.
6. Nộp kết quả qua MCP submit_result: điểm trắc nghiệm, điểm tự luận, tổng điểm,
   kết quả từng câu trắc nghiệm, nhận xét tự luận theo bước, URL ảnh trắc nghiệm
   đã chấm (annotatedImageUrl) + URL ảnh tự luận đã chấm (annotatedEssayImageUrl).
   Mọi bài đều phải có kết quả (lỗi → fail_job với lý do tiếng Việt).
```

## Ảnh chấm (tự tô khoanh)

- Vẽ lên **bản sao** ảnh gốc (không sửa ảnh HS nộp), bằng PIL.
- Trắc nghiệm: khoanh **xanh lá** ô HS chọn đúng; **đỏ** ô HS chọn sai;
  **vàng** ô đáp án đúng của câu HS chọn sai.
- Tự luận — **khung ghi chú từng bước barem (phương án A, bác chốt 20/11)**,
  theo ý tưởng `draw_logic_step_box` của repo tham khảo
  (`tao_bo_anh_da_cham.py` — hàm này nhận cả điểm + ghi chú từng ý, kèm tem
  tổng `draw_question_total` "[ TỔNG C19: 1,00 / 1,00đ ]"; lưu ý: code gốc
  hiện chỉ vẽ chữ điểm đỏ, ghi chú nó nhận vào mà không vẽ — app mình vẽ cả
  ghi chú ra như bác yêu cầu):
  - Mỗi bước barem → 1 khung nhỏ đặt **ngay cạnh chỗ HS viết ý đó** (dóng lề
    phải nếu còn chỗ trống; không có chỗ thì đặt dưới đoạn viết đó).
  - Trong khung: điểm bước bằng **mực đỏ** (`+0,5đ [✓]` / `0,00đ [✗]`) +
    **1 dòng ghi chú ngắn** (nội dung bước / lý do cho hay không cho điểm,
    VD "Thiếu cơ chế CaO trung hoà H+, bổ sung Ca2+").
  - Khung: viền đỏ mỏng, nền trắng mờ — **tuyệt đối không che chữ HS**; nếu
    trang chật thì thu chữ ghi chú nhỏ lại, không vẽ khung đè lên chữ.
  - Cuối trang vẽ tem tổng kiểu repo gốc: `[ Tự luận: x,xx/3,0đ ]`
    (nền nhạt + viền đỏ).
  - Highlight **vàng** chỗ sai (alpha 0.40) như trước.
- Tọa độ ô: xác định bằng mắt (visual grounding) trên ảnh đã xoay đúng hướng.
  Phiếu nào dò không ra lưới ô rõ ràng → KHÔNG khoanh bừa: nộp ảnh gốc + bảng
  đúng/sai từng câu trong kết quả để app hiện thay.
- Tải **CẢ 2 ảnh đã chấm** lên storage của app (bucket `cham-diem`, đường dẫn
  `sessions/<session_id>/<submission_id>/annotated-1.jpg` cho trắc nghiệm và
  `annotated-2.jpg` cho tự luận — theo đúng pattern ký signed URL của
  thaoluannhom: URL-encode từng đoạn path riêng, giữ nguyên `/`).
  Nộp kết quả với **cả 2 URL**: `annotatedImageUrl` (trắc nghiệm) và
  `annotatedEssayImageUrl` (tự luận, cột `annotated_essay_image_url`,
  migration 002) — app hiện cả 2 ảnh trong phần sản phẩm.
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

## Job tách ý barem tự luận (từ 25/11/2026)

- GV nạp file Word ở trang tạo phiên → app tạo job trong `cdtn_barem_jobs`
  (nguyên văn phần tự luận + bản tách máy hiển thị tạm) → hook
  `cdtn-grade-watch` đánh thức (chỉ đọc GET + wake, KHÔNG claim được vì
  môi trường hook bị proxy chặn PATCH/POST) → worker báo tin → main agent:
  MCP `claim_barem_job` (worker mặc định `muse-main`) → đọc `raw_text` →
  tách thành từng ý 0,25 theo ý nghĩa, tổng điểm giữ nguyên → MCP
  `submit_barem_result`. Trang tạo phiên poll 5s, tối đa 3 phút; quá hạn
  giữ bản tách máy, có nút "Nhờ AI tách lại".
- Cổng MCP: POST https://cham-diem-trac-nghiem.vercel.app/api/mcp,
  header Authorization Bearer <AI_WORKER_TOKEN> (file
  ~/.config/muse-chat-grader/ai_worker_token_cdtn, 0600 — không in).
- Supabase RIÊNG của app: https://ofidlkjcjyzwlfnzfzur.supabase.co,
  service key file ~/.config/muse-chat-grader/supabase_service_key_cdtn
  (0600 — không in, không ghi đè file key của thaoluannhom).

## Sửa barem sau duyệt + chấm lại (từ 28/11/2026)

- GV sửa barem tự luận ngay trong trang phiên (nút "Sửa barem" → PATCH
  `/api/sessions/[id]/barem`): chỉ thay `answer_key.essayBarem`, điểm cũ
  giữ nguyên cho đến khi chấm lại.
- Nút "Chấm lại" có 3 chế độ (POST `/api/sessions/[id]/regrade`):
  `essay` = chỉ tự luận, `mcq` = chỉ trắc nghiệm, `both` = cả hai.
  Job chấm lại nằm trong `cdtn_grade_jobs` với `mode` tương ứng
  (migration 005; chưa chạy migration thì mode mã hoá ở tiền tố stage
  `regrade:<mode>|...` — code đọc được cả hai). Bài đã chấm được đưa về
  `queued` + gắn job mới; hook `cdtn-grade-watch` vẫn đánh thức như job thường.
- Khi nhận job: `get_job` trả `job.mode` + `existing_results` (kết quả cũ
  từng bài). Brief cho agent chấm lại:
  - mode `essay`: chỉ chấm tự luận theo barem MỚI của phiên, vẽ lại ảnh
    tự luận (annotated-2.jpg), submit chỉ `essay_steps` + `scoreEssay` +
    `annotatedEssayImageUrl` (+ feedback mới nếu có). KHÔNG gửi items.
  - mode `mcq`: chỉ chấm trắc nghiệm theo đáp án hiện tại, vẽ lại ảnh
    khoanh (annotated-1.jpg), submit chỉ `items` + `exam_code` +
    `annotatedImageUrl`. KHÔNG gửi essay_steps.
  - mode `full` (both): chấm như job thường, đủ cả 2 ảnh.
- App tự SỬA điểm trên đúng dòng kết quả cũ (không tạo dòng trùng), giữ
  nguyên phần không chấm lại, tính lại tổng điểm, và đưa bài về
  `approved=false` (chờ GV duyệt lại). Bài lỗi trong job chấm lại từng
  phần: app giữ nguyên kết quả cũ, không ghi dòng lỗi đè điểm cũ.
- Bài mới tải lên trong lúc job chấm lại đang chạy sẽ vào job chấm đủ
  riêng (không bị chấm thiếu phần).
