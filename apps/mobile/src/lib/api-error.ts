import type { Problem } from "@workspace/contracts"

// ApiError / unwrap / errorMessage: same as apps/web/lib/api.ts.

/** Error thrown for any non-2xx API response (RFC 9457 problem details). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Partial<Problem> | undefined
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed (${status})`)
    this.name = "ApiError"
  }

  get code() {
    return this.problem?.code
  }

  /** Field errors from a 422, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem?.errors ?? []).map((e) => [e.path, e.message])
    )
  }
}

/** Unwrap an openapi-fetch result or throw an ApiError. */
export async function unwrap<
  R extends { data?: unknown; error?: unknown; response: Response },
>(promise: Promise<R>): Promise<NonNullable<R["data"]>> {
  const { data, error, response } = await promise
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, error as Partial<Problem> | undefined)
  }
  return data as NonNullable<R["data"]>
}

/** Human message for toasts, with friendlier copy for known codes. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      const first = error.problem?.errors?.[0]
      return first
        ? `${first.path}: ${first.message}`
        : "Please check the form."
    }
    return error.message
  }
  return error instanceof Error ? error.message : "Something went wrong"
}
