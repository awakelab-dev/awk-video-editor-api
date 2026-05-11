import { NextFunction, Request, Response } from 'express'

export function jsonErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (!err) return next()

  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ success: false, message: 'Payload too large' })
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' })
  }

  console.error('Unhandled request error:', sanitizeError(err))
  return res.status(err.statusCode || err.status || 500).json({ success: false, message: err.expose ? err.message : 'Server error' })
}

function sanitizeError(err: any) {
  if (!err || typeof err !== 'object') return err
  const copy: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(err)) {
    if (/secret|password|token|authorization|uri/i.test(k)) continue
    copy[k] = v
  }
  return copy
}
