export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = "Operation"): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
      });
  });
}

type TimeoutFetchOptions = {
  timeoutMs: number;
  name: string;
};

export function createTimeoutFetch({ timeoutMs, name }: TimeoutFetchOptions): typeof fetch {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch;
  }

  return async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const upstreamSignal = init.signal;

    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort(upstreamSignal.reason);
      } else {
        upstreamSignal.addEventListener(
          "abort",
          () => controller.abort(upstreamSignal.reason),
          { once: true },
        );
      }
    }

    try {
      return await fetch(input, {
        ...init,
        redirect: init.redirect ?? "error",
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error) && !upstreamSignal?.aborted) {
        throw new TimeoutError(`${name} request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
