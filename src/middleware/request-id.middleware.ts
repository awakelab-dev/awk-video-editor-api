import { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'crypto'

declare global {
  namespace Express {
    interface Request {
      requestId?: string
      actorId?: string
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id']?.toString() ?? randomUUID()
  req.requestId = requestId
  res.setHeader('x-request-id', requestId)
  next()
}
