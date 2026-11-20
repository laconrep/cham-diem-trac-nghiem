-- Migration 002: ảnh tự luận đã chấm (khung ghi chú từng bước barem, phương án A).
-- Tách URL ảnh tự luận đã chấm ra khỏi ảnh trắc nghiệm đã chấm để app hiển thị
-- cả hai trong phần sản phẩm (trước đây URL ảnh tự luận bị giấu trong per_question.note).
alter table public.cdtn_grade_results
  add column if not exists annotated_essay_image_url text;
