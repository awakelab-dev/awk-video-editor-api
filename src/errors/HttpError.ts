import { ErrorCode } from "../utils/response";

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details: string[];

  constructor(status: number, code: ErrorCode, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "HttpError";
  }
}
