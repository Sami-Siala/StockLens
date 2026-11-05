import type { ApiError } from "@/lib/contract";

export type DataErrorCode = ApiError["error"]["code"] | "network";

/** Failure of a data-access call. The UI maps `code` to a calm, localised sentence. */
export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly retryAfter?: number;

  constructor(code: DataErrorCode, message?: string, retryAfter?: number) {
    super(message ?? code);
    this.name = "DataError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
