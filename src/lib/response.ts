import { Response } from 'express'

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T,
  meta?: Record<string, unknown>
): void {
  res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {})
  })
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors?: Array<{ field?: string; message: string }>
): void {
  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {})
  })
}
