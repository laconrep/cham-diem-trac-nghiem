-- Migration 005: chế độ chấm của job (chấm lại từng phần).
-- Chạy trên project Supabase RIÊNG của app chấm điểm
-- (https://ofidlkjcjyzwlfnzfzur.supabase.co) bằng SQL Editor (service key không chạy DDL).
--
-- mode: 'full' = chấm cả bài (mặc định), 'essay' = chỉ chấm lại tự luận,
-- 'mcq' = chỉ chấm lại trắc nghiệm. Code app vẫn chạy được khi chưa chạy
-- migration này (chế độ được mã hoá tạm vào tiền tố của cột stage), chạy
-- migration xong thì chế độ nằm ở cột riêng cho sạch.
alter table public.cdtn_grade_jobs
  add column if not exists mode text not null default 'full';
