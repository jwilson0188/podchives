/** Serial polling: failures never publish data, and disposed requests cannot
 * publish into a newer page snapshot. Injectable timers keep tests deterministic. */
export function startQueuePolling<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  success: (value: T) => void;
  failure: () => void;
  visible?: () => boolean;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const tick = async () => {
    if (stopped) return;
    if (options.visible?.() === false) { timer = schedule(tick, 4000); return; }
    controller = new AbortController();
    deadline = schedule(() => controller?.abort(), 15000);
    try {
      const result = await options.read(controller.signal);
      if (!stopped) options.success(result);
    } catch {
      if (!stopped) options.failure();
    } finally {
      if (deadline !== undefined) cancel(deadline);
      if (!stopped) timer = schedule(tick, 4000);
    }
  };
  void tick();
  return () => { stopped = true; if (timer !== undefined) cancel(timer); if (deadline !== undefined) cancel(deadline); controller?.abort(); };
}
