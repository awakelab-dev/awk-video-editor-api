import { randomUUID } from "crypto";

export type ErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details: string[];
  };
  meta: {
    requestId: string;
  };
}

export function createRequestId(): string {
  return randomUUID();
}

export function successResponse<T>(data: T, requestId: string): SuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  };
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  details: string[],
  requestId: string
): ErrorResponse {
  return {
    error: {
      code,
      message,
      details
    },
    meta: {
      requestId
    }
  };
}
