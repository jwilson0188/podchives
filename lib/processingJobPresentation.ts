type JobState = { status: string; errorMessage: string | null };

/** Cancellation/supersession are encoded in existing terminal job messages. */
export function processingJobPresentation(job: JobState) {
  const stopped = job.errorMessage === "Stopped by user";
  const cancelled = job.errorMessage?.startsWith("cancelled:") ?? false;
  const superseded = job.errorMessage?.startsWith("superseded:") ?? false;
  const inactive = stopped || cancelled || superseded;
  return {
    status: stopped ? "stopped" : cancelled ? "cancelled" : superseded ? "superseded" : job.status,
    inactive,
    retryable: job.status === "failed" && !cancelled && !superseded,
    completed: job.status === "completed" && !inactive,
  };
}

export async function requestJobRetry(jobId: string, send: typeof fetch = fetch): Promise<{ demo: boolean }> {
  const response = await send(`/api/processing-jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST", cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 409) throw new Error("This job can no longer be retried. Refresh the queue to see its current state.");
    if (response.status === 404) throw new Error("This job no longer exists. Refresh the queue.");
    throw new Error("Retry failed. Please try again.");
  }
  if (body?.ok !== true || (body.demo !== true && (body.demo !== false || typeof body.job?.id !== "string"))) {
    throw new Error("Retry was not confirmed. Refresh the queue before trying again.");
  }
  return { demo: body.demo === true };
}
