# Dự án riêng: Chấm điểm trắc nghiệm + tự luận (app riêng, tách khỏi thaoluannhom)

Trạng thái: ĐÃ LIVE 19/11/2026 (https://cham-diem-trac-nghiem.vercel.app/). Sửa 19/11 ~22:15: parse-answer đọc thêm barem tự luận từ file Word (xem mục 3).

## Spec đã chốt (6 phần + bổ sung)

1. **Phạm vi:** phiên cá nhân (Giao việc cá nhân). HS nộp 2–3 ảnh: 1 phiếu trắc nghiệm + 1–2 trang tự luận.
2. **Tự phát hiện phiếu trắc nghiệm:** app/trợ lý tự nhận biết ảnh nào là phiếu trắc nghiệm, ảnh nào là tự luận (không cần GV khai báo loại bài).
3. **Đáp án:** GV tải file **Word (.docx)** chứa bảng đáp án — cột là mã đề, dòng là câu hỏi. App đọc bảng trong file Word → hiện **tiêu chí chấm** (từng câu: đáp án đúng + điểm) cho GV **duyệt/sửa trước**, duyệt xong mới bắt đầu chấm. Khi chấm: đọc mã đề trên phiếu HS → lấy đúng cột mã đề đó để đối chiếu. **Barem tự luận cũng nạp từ chính file Word** (mục "BAREM TỰ LUẬN", mỗi dòng "Nội dung | điểm", hoặc bảng "Nội dung/Bước | Điểm") — tải file xong ô barem tự điền sẵn, GV sửa trực tiếp nếu cần; trang phiên hiện lại barem đã lưu để kiểm chứng. (Lỗi 19/11: parse-answer chỉ đọc bảng trắc nghiệm, luôn trả essayBarem [] nên barem không nạp được — đã sửa 19/11 ~22:15.)
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

## Sửa lỗi phát hiện khi rà soát (19/11 ~17:09, trước khi push)

- **Đụng tên bảng Supabase:** migration gốc dùng bảng `sessions`/`submissions` — project dùng chung đã có 2 bảng này của thaoluannhom (schema khác). `CREATE TABLE IF NOT EXISTS` sẽ âm thầm bỏ qua việc tạo bảng, app sẽ ghi vào bảng của thaoluannhom. **Đã sửa:** toàn bộ bảng app riêng dùng tiền tố `cdtn_` (`cdtn_sessions`, `cdtn_submissions`, `cdtn_grade_jobs`, `cdtn_grade_results`) — code + migration + README; build lại pass. Commit local d494a45.

## Repo đã tạo + vướng push (19/11 ~17:24–17:25)

- **Repo ĐÃ TẠO XONG qua trình duyệt** (bác tự đăng nhập laconrep + 2FA): https://github.com/laconrep/cham-diem-trac-nghiem — Public, trống, không README/.gitignore/license.
- **Push bị chặn (403):** token đã lưu là fine-grained chỉ cho push vào repo đã chọn — kiểm chứng: push thử thaoluannhom_giaodien OK, push repo mới bị "Permission denied to laconrep" dù API báo push: True. Đang sửa bằng trình duyệt: thêm `cham-diem-trac-nghiem` vào allowlist của token (không tạo/xóa token, không đụng giá trị token).
- **19/11 ~17:27: trình duyệt đã thêm repo vào token "suathaolaun" (tạo 24/10/2026) nhưng push VẪN 403** — token trong file KHÔNG phải suathaolaun. Kiểm chứng: token trong file ghi được vào thaoluannhom_giaodien (tạo + xóa nhánh tmp-token-test OK, đã dọn sạch) nhưng không ghi được cham-diem-trac-nghiem và Kehoachdayhoc. Cần liệt kê mọi fine-grained token để tìm đúng token trong file (khả năng tạo ~07/11, danh sách repo API của nó gồm 11 repo: cham-diem-hoc-sinh, cham-diem-hoc-sinh-standalone, cham-diem-trac-nghiem, JSSDK-Demo, Kehoachdayhoc, OmniRoute, ontapsinhhoc2026, register, thaoluannhom, thaoluannhom_giaodien, thaoluannhom_sub) rồi thêm repo vào đúng token đó. Helper askpass đã dời sang ~/.cache/git-askpass-laconrep.sh (file ở /tmp bị dọn mất).
- **19/11 ~17:31 ĐÍNH CHÍNH: token trong file là fine-grained (1 dòng 93 ký tự, tiền tố github_pat_), KHÔNG phải classic "muse-push-chambainguvan"** (suy luận sai của trình duyệt — classic không có tiền tố github_pat_). Kiểm chứng push thật: chỉ ghi được thaoluannhom_giaodien; KHÔNG ghi được ontapsinhhoc2026, thaoluannhom, Kehoachdayhoc, cham-diem-trac-nghiem. Token khớp nhất là **"sua3"** (tạo 22/10/2026, chỉ có thaoluannhom_giaodien, last used trong tuần qua) — **HẾT HẠN 21/11/2026**. Đang cho trình duyệt thêm cham-diem-trac-nghiem vào sua3 rồi push lại ngay. Bài học: /user/repos + trường permissions của API KHÔNG phản ánh đúng quyền ghi của fine-grained token — push thật bằng git mới là chuẩn.
- **19/11 ~17:32 PUSH XONG:** trình duyệt thêm cham-diem-trac-nghiem vào sua3 (xác nhận đủ 2 repo), push 2 commit lên main thành công, kiểm chứng qua API: repo public, default branch main, 2 commit (926be6b v1 + d494a45 cdtn_), đủ file (app, components, lib, supabase, README, DESIGN.md, GRADE_PROTOCOL.md). Repo: https://github.com/laconrep/cham-diem-trac-nghiem. **Việc tiếp theo: deploy lên v0.app (import repo GitHub) + đặt env vars + chạy migration 001_init.sql.** Nhắc bác: token sua3 hết hạn 21/11/2026 — sau đó cần token mới để push tiếp.

## Khung ghi chú ảnh tự luận (phương án A, bác chốt 20/11)

- **Vấn đề:** ảnh tự luận đã chấm chỉ ghi điểm từng bước ở lề + bảng điểm cuối trang, không có khung ghi chú từng ý; hơn nữa app chỉ hiện 1 ảnh đã chấm (trắc nghiệm) — URL ảnh tự luận bị giấu trong `per_question.note`, không hiện trong phần sản phẩm.
- **Sửa:** migration 002 thêm cột `cdtn_grade_results.annotated_essay_image_url`; `submit_result` (MCP) nhận thêm `annotatedEssayImageUrl`; trang phiên hiện thêm mục "Ảnh tự luận đã chấm" dưới bảng điểm từng bước; quy trình chấm (GRADE_PROTOCOL.md) quy định vẽ khung ghi chú từng bước barem: điểm đỏ (+0,5đ [✓] / 0,00đ [✗]) + 1 dòng ghi chú ngắn, đặt cạnh chỗ HS viết ý đó, không che chữ HS; tem tổng "[ Tự luận: x,xx/3,0đ ]" cuối trang; highlight vàng chỗ sai giữ nguyên.
- **Lưu ý repo gốc:** `draw_logic_step_box` của `tao_bo_anh_da_cham.py` nhận cả điểm + ghi chú nhưng code hiện tại chỉ vẽ chữ điểm đỏ (ghi chú không vẽ ra) — app mình vẽ cả ghi chú theo yêu cầu của bác.
- **Backfill:** 3 bài phiên "10" đã chấm trước khi có tính năng này được vẽ lại khung ghi chú từ kết quả đã lưu (không chấm lại điểm).

## Giao diện kết quả (bác chốt 20/11 ~17:13, commit 6e0cb01)

- 2 ảnh đã chấm (trắc nghiệm + tự luận) nằm cạnh nhau trong 1 hàng kéo ngang (`flex overflow-x-auto`, mỗi ảnh nửa rộng tối thiểu 280px) — sau này có thêm ảnh thì giáo viên kéo ngang xem tiếp.
- Bảng điểm từng câu + điểm từng bước tự luận ẩn trong thẻ gấp `<details>` tên "Chấm chi tiết", mặc định đóng, bấm vào mới sổ ra.
- Dòng điểm tổng (TN/TL/mã đề), nhận xét chung và nút Duyệt vẫn hiện như cũ.

## Xem ảnh đã chấm (bác chốt 20/11 ~18:55, commit 73fcf9e)

- Bấm vào ảnh đã chấm (trắc nghiệm hoặc tự luận) → ảnh mở to hết màn hình ngay trong trang (lightbox nền đen), KHÔNG mở tab mới. Góc phải trên có nút ✕ để tắt; bấm ra nền đen hoặc phím Esc cũng tắt.

## Thang điểm tự luận nhỏ nhất 0,25đ (bác chốt 20/11)

- **Vấn đề:** bài Cẩm Diên phiên "10" có bước b6 (0,25đ) được cho 0,125đ — nửa bước, thang điểm lẻ, tổng tự luận ra 2,625 → 2,63đ.
- **Quy tắc:** điểm mỗi bước tự luận CHỈ được là bội số của 0,25 (0 / 0,25 / 0,5 / …) và không vượt điểm tối đa của bước. Bước 0,25đ chỉ 0 hoặc 0,25; bước 0,5đ chỉ 0 / 0,25 / 0,5.
- **Sửa 2 lớp:** (1) `GRADE_PROTOCOL.md` bước 4 — agent chấm phải cho đúng ngay từ đầu để khung ghi chú trên ảnh khớp điểm đã lưu; (2) code — `lib/scoring.ts` thêm `ESSAY_STEP` + `snapEssayStep` + `normalizeEssaySteps`, `lib/ai/jobs.ts` `submitJobResult` chuẩn hoá các bước về bội số 0,25 gần nhất rồi tính lại điểm tự luận + tổng điểm trước khi ghi (điểm trắc nghiệm giữ nguyên).
- **Đã sửa xong 20/11 ~20:52 theo lệnh bác:** b6 cho 0,25đ, tổng tự luận 2,75, tổng bài 8,50; khung b6 trên ảnh vẽ lại +0,25đ, tem 2,75/3,0đ (kiểm chứng: PATCH điểm OK + HEAD ảnh mới 200, 218.845 byte).

## Tài khoản giáo viên + quản trị (phương án A + admin, spec v2 bác chốt 20/11 ~21:28)

- **Đăng ký / đăng nhập:** Supabase Auth email + mật khẩu, theo đúng mẫu `@supabase/ssr` của app thaoluannhom (`lib/supabase/client.ts` browser, `lib/supabase/server.ts` server, `lib/supabase/proxy.ts` + `middleware.ts` refresh session). Trang `/register` (tên GV + email + mật khẩu ≥6 ký tự, xác nhận qua email), `/login` (giữ `?next=` để đăng nhập xong quay lại đúng trang), `/forgot-password` + `/reset-password`, callback `/auth/callback` đổi code lấy session. Đăng ký tự do, không cần duyệt.
- **Mỗi GV chỉ thấy phiên của mình:** migration 003 thêm cột `cdtn_sessions.owner_id` (uuid) + index; phiên mới tạo mang `owner_id` là tài khoản đang đăng nhập; mọi trang danh sách/chi tiết phiên và mọi API route (sessions, results, grade, submissions, approve, export, parse-answer) đều kiểm tra quyền qua `lib/auth.ts` (`requireApiUser` → 401, `checkSessionAccess`/`checkResultAccess` → 403). Phiên "10" cũ được gán cho tài khoản admin trong migration 003. Cổng MCP (`/api/mcp`) KHÔNG đổi — vẫn dùng Bearer `AI_WORKER_TOKEN`.
- **Admin:** xác định THEO EMAIL trong code (`ADMIN_EMAILS = ["gagabux95@gmail.com"]` trong `lib/auth.ts`) — không đụng `user_metadata`/`app_metadata` vì tài khoản này dùng chung auth với app thaoluannhom. Tài khoản admin đã đặt mật khẩu + xác nhận email qua Supabase Auth Admin API ngày 20/11, đăng nhập kiểm chứng OK (mật khẩu do bác cấp, không ghi lại). Admin thấy tất cả phiên (danh sách hiện email chủ phiên) + trang `/admin` (Quản lý tài khoản): liệt kê GV đã đăng ký (tên, email, ngày đăng ký, lần đăng nhập cuối, số phiên) + nút "Chấm dứt tài khoản" (server action xóa auth user; GV đó không đăng nhập được nữa; phiên của họ giữ lại để admin đối chiếu; admin không tự chấm dứt tài khoản của mình).
- **Giới hạn nói thẳng với bác (spec v2 điểm 8):** bucket ảnh `cham-diem` đang PUBLIC nên link ảnh trực tiếp vẫn mở được nếu ai đó có link — chỉ danh sách phiên trong app là riêng từng người. Muốn khóa hẳn thì làm bước sau (ký link ảnh riêng cho từng người xem).
- **Kỹ thuật:** dữ liệu vẫn đọc qua service key (bảng chưa bật RLS — như kiến trúc hiện tại của app), lọc theo `owner_id` trong code. Header hiện tên GV + nút đăng xuất (`components/LogoutButton.tsx`); admin có thêm nút "Quản lý tài khoản".
- **Bài học build:** trang dùng `useSearchParams()` (vd `/login`) phải bọc `<Suspense>` thì `next build` mới prerender được — không bọc sẽ lỗi "Export encountered an error on /login/page".
