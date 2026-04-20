function clampInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function normalizeRetryOptions(input) {
  if (!input || typeof input !== "object") {
    return { count: 0, jitterMs: 0 };
  }
  return {
    count: clampInteger(input.count, { min: 0, max: 5, fallback: 0 }),
    jitterMs: clampInteger(input.jitterMs, { min: 0, max: 2000, fallback: 0 })
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelayMs(attemptIndex, retry, randomFn = Math.random) {
  const base = 100 * Math.pow(2, Math.max(0, attemptIndex));
  const jitter = retry.jitterMs > 0 ? Math.floor(randomFn() * (retry.jitterMs + 1)) : 0;
  return base + jitter;
}

async function runWithRetry(task, retry, options = {}) {
  const normalized = normalizeRetryOptions(retry);
  const randomFn = typeof options.randomFn === "function" ? options.randomFn : Math.random;
  let lastError = null;
  for (let attempt = 0; attempt <= normalized.count; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= normalized.count) break;
      const delay = computeRetryDelayMs(attempt, normalized, randomFn);
      await sleep(delay);
    }
  }
  throw lastError;
}

module.exports = {
  normalizeRetryOptions,
  computeRetryDelayMs,
  runWithRetry
};
