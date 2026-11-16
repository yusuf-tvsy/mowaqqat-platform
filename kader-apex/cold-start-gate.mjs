/**
 * Coalesce cold-start health probes. Never send client cookies, auth, or write
 * requests to the probe. Only confirmed ok:true responses mark the app ready.
 */
export function createColdStartGate({
  fetcher,
  healthUrl,
  now = () => Date.now(),
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  readyTtlMs = 240000,
  totalTimeoutMs = 70000,
  probeTimeoutMs = 39000,
  maxAttempts = 3,
}) {
  let readyUntil = 0;
  let inFlight = null;

  async function probeUntilReady() {
    const deadline = now() + totalTimeoutMs;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const remaining = deadline - now();
      if (remaining < 1000) return false;
      let response;
      try {
        response = await fetcher(healthUrl, {
          method: 'GET',
          headers: {accept: 'application/json'},
          redirect: 'error',
          signal: AbortSignal.timeout(Math.max(1000, Math.min(probeTimeoutMs, remaining - 250))),
        });
        if (response.status === 200) {
          const body = await response.json().catch(() => null);
          if (body?.ok === true) {
            readyUntil = now() + readyTtlMs;
            return true;
          }
        }
      } catch { /* transient timeout/network errors are retried */ }
      finally {
        try { await response?.body?.cancel(); } catch { /* already consumed */ }
      }
      if (attempt < maxAttempts - 1) {
        const timeLeft = deadline - now();
        if (timeLeft < 1000) return false;
        await pause(Math.min(750 * (attempt + 1), Math.max(0, timeLeft - 500)));
      }
    }
    return false;
  }

  return {
    ensureReady() {
      if (now() < readyUntil) return Promise.resolve(true);
      if (!inFlight) {
        const current = probeUntilReady();
        inFlight = current.finally(() => { inFlight = null; });
      }
      return inFlight;
    },
    markReady() { readyUntil = now() + readyTtlMs; },
  };
}
