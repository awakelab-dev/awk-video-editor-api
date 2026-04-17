import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { AppError } from '../lib/errors'
import { sendError } from '../lib/response'

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    const flatErrors = error.issues.map((issue) => ({
      field: issue.path.join('.') || undefined,
      message: issue.message
    }))
    sendError(res, 422, 'Validation failed', flatErrors)
    return
  }

  if (error instanceof AppError) {
    sendError(res, error.statusCode, error.message, error.errors)
    return
  }

  logger.error('Unhandled error', {
    requestId: req.requestId,
    message: error instanceof Error ? error.message : 'Unknown error'
  })

  sendError(
    res,
    500,
    env.NODE_ENV === 'production' ? 'Internal server error' : 'Unexpected server error'
  )
}
