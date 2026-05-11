import { randomUUID } from 'crypto'
import { NextFunction, Request, Response } from 'express'

export type RequestWithId = Request & { requestId?: string }

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string | undefined)?.trim() || randomUUID()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  const originalJson = res.json.bind(res)
  res.json = ((body: any) => {
    if (body && typeof body === 'object' && !Array.isArray(body) && body.requestId === undefined) {
      body.requestId = requestId
    }
    return originalJson(body)
  }) as typeof res.json

  next()
}
