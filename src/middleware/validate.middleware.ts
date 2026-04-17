import { NextFunction, Request, Response } from 'express'
import { ZodTypeAny } from 'zod'

type ValidatableRequest = Request & {
  validated?: {
    params?: unknown
    query?: unknown
    body?: unknown
  }
}

export function validateRequest(schema: {
  params?: ZodTypeAny
  query?: ZodTypeAny
  body?: ZodTypeAny
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const request = req as ValidatableRequest

      request.validated = {
        params: schema.params ? schema.params.parse(req.params) : req.params,
        query: schema.query ? schema.query.parse(req.query) : req.query,
        body: schema.body ? schema.body.parse(req.body) : req.body
      }

      if (schema.body) {
        req.body = request.validated.body
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}
