import { describe, expect, test } from "vitest";
import {
  normalizeRetryOptions,
  computeRetryDelayMs,
  runWithRetry
} from "../src/shared/networkRetry.cjs";

describe("networkRetry", () => {
  test("normalizeRetryOptions clamps and defaults", () => {
    expect(normalizeRetryOptions()).toEqual({ count: 0, jitterMs: 0 });
    expect(normalizeRetryOptions({ count: -3, jitterMs: 5000 })).toEqual({
      count: 0,
      jitterMs: 2000
    });
    expect(normalizeRetryOptions({ count: 2.9, jitterMs: 25.4 })).toEqual({
      count: 2,
      jitterMs: 25
    });
  });

  test("computeRetryDelayMs applies exponential backoff + jitter", () => {
    const retry = { count: 2, jitterMs: 50 };
    expect(computeRetryDelayMs(0, retry, () => 0)).toBe(100);
    expect(computeRetryDelayMs(1, retry, () => 0)).toBe(200);
    expect(computeRetryDelayMs(1, retry, () => 1)).toBe(251);
  });

  test("runWithRetry retries and eventually succeeds", async () => {
    let attempts = 0;
    const result = await runWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("temporary");
        return "ok";
      },
      { count: 2, jitterMs: 0 }
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  test("runWithRetry throws last error after retries exhausted", async () => {
    let attempts = 0;
    await expect(
      runWithRetry(
        async () => {
          attempts += 1;
          throw new Error(`fail-${attempts}`);
        },
        { count: 1, jitterMs: 0 }
      )
    ).rejects.toThrow("fail-2");
  });
});
