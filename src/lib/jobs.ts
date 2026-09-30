export const JOB_COLUMNS =
  "id, kind, status, input, progress, warnings, result, attempts, max_attempts, last_error, run_after, created_at, updated_at, finished_at";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type JobView = {
  id: string;
  kind: string;
  status: JobStatus;
  input: { mal_id?: number; entry_id?: string; traverse?: boolean; title?: string } | null;
  progress: { phase?: string; message?: string; works?: number; episodes?: number; episodeListsRemaining?: number } | null;
  warnings: { code: string; message: string; malId?: number }[] | null;
  result: { entry_id?: string; coverage?: Record<string, unknown> } | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  run_after: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export const isActiveJob = (job: Pick<JobView, "status">) => job.status === "queued" || job.status === "running";
