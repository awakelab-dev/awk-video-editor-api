import { NextFunction, Request, Response } from 'express'

export function authReadyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const actorId = req.headers['x-user-id']?.toString()?.trim() || 'anonymous-user'
  req.actorId = actorId
  next()
}
