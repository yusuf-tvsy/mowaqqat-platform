/** Retry transient upstream failures only for safe, idempotent reads. */
export async function fetchWithSafeReadRetries({
  fetcher,
  url,
  options,
  method,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  const safeRead = method === 'GET' || method === 'HEAD';
  const maxAttempts = safeRead ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt) await delay(attempt === 1 ? 750 : 1500);
    let response;
    try {
      response = await fetcher(url, options);
    } catch (error) {
      if (attempt === maxAttempts - 1 || options.signal?.aborted) throw error;
      continue;
    }
    if (safeRead && [502, 503, 504].includes(response.status) && attempt < maxAttempts - 1) {
      try { await response.body?.cancel(); } catch { /* Response can already be consumed. */ }
      continue;
    }
    return response;
  }
  throw new Error('No upstream response');
}
