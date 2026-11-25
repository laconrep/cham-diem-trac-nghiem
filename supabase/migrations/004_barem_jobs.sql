-- Migration 004: job tách ý + dựng barem tự luận bằng AI (MCP worker).
-- Chạy trên project Supabase RIÊNG của app chấm điểm
-- (https://ofidlkjcjyzwlfnzfzur.supabase.co) bằng SQL Editor (service key không chạy DDL).
--
-- Luồng: GV nạp file Word đáp án -> app lấy nguyên văn phần tự luận, tạo 1 job
-- ở đây kèm bản tách máy (machine_barem) để hiển thị tạm. Worker AI (Muse qua
-- cổng MCP) claim job, đọc raw_text, tách thành từng ý 0,25 theo ý nghĩa và
-- submit result_barem. Trang tạo phiên poll trạng thái; quá hạn chờ thì giữ
-- bản tách máy. Bảng chưa bật RLS — như kiến trúc hiện tại của app (lọc theo
-- owner_id trong code).
create table if not exists public.cdtn_barem_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  raw_text text not null,
  machine_barem jsonb not null default '[]'::jsonb,
  status text not null default 'queued',
  worker_id text,
  result_barem jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  done_at timestamptz
);
create index if not exists cdtn_barem_jobs_status_idx
  on public.cdtn_barem_jobs (status, created_at);
create index if not exists cdtn_barem_jobs_owner_idx
  on public.cdtn_barem_jobs (owner_id, created_at);
