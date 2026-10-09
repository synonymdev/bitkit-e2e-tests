/** A recovery observation never retries the operation or resets the app. */
export async function observeRecovery({
  probe,
  startedAt,
  timeoutMs = 7 * 60_000,
  now = () => performance.now(),
  pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  record,
}: {
  probe: () => Promise<boolean>;
  startedAt: number;
  timeoutMs?: number;
  now?: () => number;
  pause?: (ms: number) => Promise<void>;
  record: (event: 'fast-path-missed' | 'ready' | 'timeout', elapsedMs: number) => void;
}): Promise<number> {
  let fastPathRecorded = false;
  const elapsed = () => {
    const elapsedMs = now() - startedAt;
    if (elapsedMs >= 30_000 && !fastPathRecorded) {
      record('fast-path-missed', elapsedMs);
      fastPathRecorded = true;
    }
    return elapsedMs;
  };
  const timeout = () => {
    record('timeout', elapsed());
    return new Error(`Pubky private session did not recover within ${timeoutMs}ms`);
  };
  while (true) {
    const remainingMs = timeoutMs - elapsed();
    if (remainingMs <= 0) throw timeout();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Error('Recovery probe exceeded observation deadline');
    let ready: boolean;
    try {
      // A pending driver request must not hold the readiness observer past its budget.
      ready = await Promise.race([
        probe(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(deadline), remainingMs);
        }),
      ]);
    } catch (error) {
      if (error === deadline) throw timeout();
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const elapsedMs = elapsed();
    if (ready && elapsedMs < timeoutMs) {
      record('ready', elapsedMs);
      return elapsedMs;
    }
    if (elapsedMs >= timeoutMs) throw timeout();
    await pause(Math.min(2000, timeoutMs - elapsedMs));
  }
}
