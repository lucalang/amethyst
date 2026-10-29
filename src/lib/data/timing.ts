import "server-only";

export async function measureServer<T>(phase: string, work: () => PromiseLike<T>): Promise<T> {
  if (process.env.ARCHIVE_PERF_LOG !== "1") return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    console.info(JSON.stringify({ event: "archive.server-timing", phase, durationMs: Math.round(performance.now() - start) }));
  }
}