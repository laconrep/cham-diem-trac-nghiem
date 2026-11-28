// Cổng MCP (JSON-RPC qua HTTP) cho worker AI chấm bài — theo mẫu
// app/api/mcp/route.ts của EduSync (ontapsinhhoc).
//
// Bảo mật: Bearer token trong env AI_WORKER_TOKEN (fail-closed: chưa đặt
// hoặc < 8 ký tự thì cổng đóng). Định danh worker qua header X-Worker-Id
// (mặc định "muse-main"). Đây KHÔNG phải API cho client thường: mọi thao
// tác đều qua các hàm nghiệp vụ trong lib/ai/jobs.ts.

import { timingSafeEqual } from "node:crypto";
import {
  claimJob,
  failJob,
  getJobForWorker,
  listPendingJobs,
  logAi,
  setJobProgress,
  setSubmissionStatus,
  submitJobResult,
  type SubmitResultInput,
} from "@/lib/ai/jobs";
import {
  claimBaremJob,
  failBaremJob,
  getBaremJob,
  listPendingBaremJobs,
  submitBaremResult,
} from "@/lib/ai/barem-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: string | number | null, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

function tokenOk(req: Request): boolean {
  const expected = process.env.AI_WORKER_TOKEN ?? "";
  if (expected.length < 8) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function workerIdOf(req: Request): string {
  const raw = req.headers.get("x-worker-id") ?? "muse-main";
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return clean || "muse-main";
}

const TOOLS = [
  {
    name: "list_pending_jobs",
    description: "Liệt kê các job chấm đang chờ xử lý (trạng thái queued).",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "claim_job",
    description: "Nhận một job để chấm (nguyên tử — một job chỉ một worker nhận được).",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
  {
    name: "get_job",
    description:
      "Đọc chi tiết job: đáp án đã duyệt (theo mã đề), barem tự luận, danh sách bài nộp (id, tên HS, URL ảnh). Job có trường mode: 'full' = chấm cả bài, 'essay' = chỉ chấm lại tự luận, 'mcq' = chỉ chấm lại trắc nghiệm. Với job chấm lại từng phần, kết quả còn kèm existing_results (điểm + chi tiết cũ của từng bài) — phần không chấm lại được app giữ nguyên.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
  {
    name: "set_progress",
    description: "Cập nhật tiến độ 0-100 (%) và nhãn giai đoạn hiển thị cho giáo viên.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        progress: { type: "number" },
        stage: { type: "string" },
      },
      required: ["jobId", "progress"],
    },
  },
  {
    name: "set_submission_status",
    description:
      "Đánh dấu trạng thái 1 bài nộp: queued (đang chờ chấm) / grading (đang chấm) / done (đã chấm xong) / error (lỗi). Dùng để trang kết quả hiện đúng trạng thái từng bài trong lúc chấm ngầm.",
    inputSchema: {
      type: "object",
      properties: {
        submissionId: { type: "string" },
        status: { type: "string", enum: ["queued", "grading", "done", "error"] },
      },
      required: ["submissionId", "status"],
    },
  },
  {
    name: "submit_result",
    description:
      "Nộp kết quả chấm 1 bài: điểm trắc nghiệm, điểm tự luận, tổng điểm, kết quả từng câu (câu, đáp án HS, đáp án đúng, đúng/sai, điểm), nhận xét tự luận theo bước, URL ảnh trắc nghiệm đã chấm (khoanh xanh/đỏ/vàng), URL ảnh tự luận đã chấm (khung ghi chú từng bước barem — annotatedEssayImageUrl), và studentName — tên HS AI đọc được trên bài làm (ô Họ và tên trên phiếu; null nếu không đọc được, app giữ tên tạm HS N). Với job chấm lại từng phần (mode 'essay'/'mcq' trong get_job): mode 'essay' chỉ cần gửi essay_steps + scoreEssay + annotatedEssayImageUrl (vẽ lại ảnh tự luận theo barem mới), phần trắc nghiệm app giữ nguyên; mode 'mcq' chỉ cần gửi items + exam_code + annotatedImageUrl (vẽ lại ảnh khoanh), phần tự luận app giữ nguyên. App tự sửa điểm trên kết quả cũ và đưa bài về chờ duyệt lại.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        submissionId: { type: "string" },
        result: {
          type: "object",
          properties: {
            scoreMcq: { type: "number" },
            scoreEssay: { type: "number" },
            scoreTotal: { type: "number" },
            perQuestion: { type: "object" },
            feedback: { type: "string" },
            annotatedImageUrl: { type: "string" },
            annotatedEssayImageUrl: { type: "string" },
            studentName: { type: "string" },
          },
          required: ["scoreMcq", "scoreEssay", "scoreTotal", "perQuestion"],
        },
      },
      required: ["jobId", "submissionId", "result"],
    },
  },
  {
    name: "fail_job",
    description:
      "Báo job (hoặc 1 bài nộp trong job) không xử lý được, kèm lý do hiển thị cho giáo viên.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        submissionId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["jobId", "reason"],
    },
  },
  {
    name: "list_pending_barem_jobs",
    description:
      "Liệt kê các job tách ý + dựng barem tự luận đang chờ (trạng thái queued). Mỗi job chứa nguyên văn phần đáp án tự luận trong file Word của giáo viên.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "claim_barem_job",
    description:
      "Nhận một job barem để tách ý (nguyên tử — một job chỉ một worker nhận được). Trả về raw_text (nguyên văn phần tự luận) và machine_barem (bản tách máy để tham khảo).",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
  {
    name: "get_barem_job",
    description:
      "Đọc chi tiết 1 job barem: raw_text (nguyên văn phần tự luận), machine_barem (bản tách máy), trạng thái. Dùng khi job đã được claim sẵn (hook claim hộ) nên không claim lại được.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
  {
    name: "submit_barem_result",
    description:
      "Nộp barem tự luận đã tách: danh sách bước, mỗi bước gồm content (nội dung ý — tiêu chí chấm cụ thể) và points (điểm, bội số của 0,25; tách nhỏ đến từng ý 0,25 theo đúng ý nghĩa của đáp án, tổng điểm giữ nguyên như trong file). Giáo viên sẽ duyệt/sửa lại trên app trước khi lưu phiên.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              points: { type: "number" },
            },
            required: ["content", "points"],
          },
        },
      },
      required: ["jobId", "steps"],
    },
  },
  {
    name: "fail_barem_job",
    description: "Báo job barem không xử lý được, kèm lý do. App sẽ giữ bản tách máy cho giáo viên sửa tay.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["jobId", "reason"],
    },
  },
] as const;

function toolText(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

async function callTool(name: string, args: Record<string, unknown>, workerId: string) {
  const jobId = typeof args.jobId === "string" ? args.jobId : "";
  switch (name) {
    case "list_pending_jobs": {
      const jobs = await listPendingJobs(workerId, typeof args.limit === "number" ? args.limit : 20);
      return toolText({ jobs });
    }
    case "claim_job": {
      const job = await claimJob(jobId, workerId);
      if (!job)
        return toolText({ ok: false, error: "Job không còn chờ (đã có worker khác nhận hoặc sai id)" }, true);
      return toolText({ ok: true, job });
    }
    case "get_job": {
      const detail = await getJobForWorker(jobId);
      if (!detail) return toolText({ ok: false, error: "Không tìm thấy job" }, true);
      return toolText({ ok: true, ...detail });
    }
    case "set_progress": {
      const res = await setJobProgress(
        jobId,
        workerId,
        typeof args.progress === "number" ? args.progress : 0,
        typeof args.stage === "string" ? args.stage : undefined
      );
      return toolText(res, !res.ok);
    }
    case "set_submission_status": {
      const status = args.status as string;
      if (!["queued", "grading", "done", "error"].includes(status)) {
        return toolText({ ok: false, error: `Trạng thái không hợp lệ: ${status}` }, true);
      }
      const res = await setSubmissionStatus(
        typeof args.submissionId === "string" ? args.submissionId : "",
        status as "queued" | "grading" | "done" | "error"
      );
      return toolText(res, !res.ok);
    }
    case "submit_result": {
      const r = (args.result ?? {}) as Record<string, unknown>;
      const input: SubmitResultInput = {
        submissionId: typeof args.submissionId === "string" ? args.submissionId : "",
        scoreMcq: typeof r.scoreMcq === "number" ? r.scoreMcq : 0,
        scoreEssay: typeof r.scoreEssay === "number" ? r.scoreEssay : 0,
        scoreTotal: typeof r.scoreTotal === "number" ? r.scoreTotal : 0,
        perQuestion: (r.perQuestion ?? { exam_code: null, items: [], essay_steps: [], errors: [], note: "" }) as SubmitResultInput["perQuestion"],
        feedback: typeof r.feedback === "string" ? r.feedback : "",
        annotatedImageUrl: typeof r.annotatedImageUrl === "string" ? r.annotatedImageUrl : null,
        annotatedEssayImageUrl:
          typeof r.annotatedEssayImageUrl === "string" ? r.annotatedEssayImageUrl : null,
        // Tên HS AI đọc được trên bài làm (ô "Họ và tên" trên phiếu); null nếu không đọc được
        // -> app giữ tên tạm "HS N" theo thứ tự chụp.
        studentName: typeof r.studentName === "string" ? r.studentName : null,
      };
      const res = await submitJobResult(jobId, workerId, input);
      return toolText(res, !res.ok);
    }
    case "fail_job": {
      const res = await failJob(
        jobId,
        workerId,
        typeof args.reason === "string" ? args.reason : "Không rõ lý do",
        typeof args.submissionId === "string" ? args.submissionId : undefined
      );
      return toolText(res, !res.ok);
    }
    case "list_pending_barem_jobs": {
      const jobs = await listPendingBaremJobs(typeof args.limit === "number" ? args.limit : 20);
      return toolText({ jobs });
    }
    case "claim_barem_job": {
      const job = await claimBaremJob(jobId, workerId);
      if (!job)
        return toolText({ ok: false, error: "Job barem không còn chờ (đã có worker khác nhận hoặc sai id)" }, true);
      return toolText({ ok: true, job });
    }
    case "get_barem_job": {
      const job = await getBaremJob(jobId);
      if (!job) return toolText({ ok: false, error: "Không tìm thấy job barem" }, true);
      return toolText({ ok: true, job });
    }
    case "submit_barem_result": {
      const res = await submitBaremResult(jobId, workerId, args.steps);
      return toolText(res, !res.ok);
    }
    case "fail_barem_job": {
      const res = await failBaremJob(
        jobId,
        workerId,
        typeof args.reason === "string" ? args.reason : "Không rõ lý do"
      );
      return toolText(res, !res.ok);
    }
    default:
      return toolText({ ok: false, error: `Tool không tồn tại: ${name}` }, true);
  }
}

export async function POST(req: Request) {
  if (!tokenOk(req)) {
    return Response.json({ error: "Cổng MCP chưa mở hoặc sai khóa" }, { status: 503 });
  }
  const workerId = workerIdOf(req);

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const id = body.id ?? null;
  const isNotification = body.id === undefined;

  try {
    switch (body.method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "cham-diem-trac-nghiem-ai-worker", version: "1.0.0" },
        });
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call": {
        const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const name = params.name ?? "";
        const args = params.arguments ?? {};
        await logAi({ workerId, action: `mcp:${name}`, jobId: typeof args.jobId === "string" ? args.jobId : null });
        const result = await callTool(name, args, workerId);
        return rpcResult(id, result);
      }
      default:
        if (isNotification) return new Response(null, { status: 202 });
        return rpcError(id, -32601, `Method not found: ${body.method ?? ""}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không xác định";
    return rpcError(id, -32603, message);
  }
}

export async function GET() {
  return Response.json({ error: "MCP endpoint chỉ nhận POST JSON-RPC" }, { status: 405 });
}
