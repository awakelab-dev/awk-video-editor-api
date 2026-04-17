import { Request, Response } from 'express'
import { sendError } from '../lib/response'

export function notFoundMiddleware(_req: Request, res: Response): void {
  sendError(res, 404, 'Route not found')
}
