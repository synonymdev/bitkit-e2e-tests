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
  while (true) {
    let elapsedMs = now() - startedAt;
    if (elapsedMs >= 30_000 && !fastPathRecorded) {
      record('fast-path-missed', elapsedMs);
      fastPathRecorded = true;
    }
    if (elapsedMs > timeoutMs) {
      record('timeout', elapsedMs);
      throw new Error(`Pubky private session did not recover within ${timeoutMs}ms`);
    }
    const ready = await probe();
    elapsedMs = now() - startedAt;
    if (ready && elapsedMs <= timeoutMs) {
      record('ready', elapsedMs);
      return elapsedMs;
    }
    if (elapsedMs >= timeoutMs) {
      record('timeout', elapsedMs);
      throw new Error(`Pubky private session did not recover within ${timeoutMs}ms`);
    }
    await pause(Math.min(2000, timeoutMs - elapsedMs));
  }
}
