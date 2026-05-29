import type { RequestHandler } from 'express'
import { HttpError } from '../errors/HttpError'
import type { ErrorCode } from './response'
import { MAX_UPLOAD_SIZE_BYTES } from './summarizeConstants'

type MulterOptions = {
  limits?: {
    fileSize?: number
  }
  storage: unknown
}

type MulterFactory = ((
  options: MulterOptions
) => { single: (fieldName: string) => RequestHandler }) & {
  memoryStorage: () => unknown
}

declare const require: (moduleName: string) => unknown

const multer = require('multer') as MulterFactory

const uploadDocument = multer({
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
  storage: multer.memoryStorage(),
}).single('file')

export const uploadSingleDocument: RequestHandler = (request, response, next) => {
  uploadDocument(request, response, (error?: unknown) => {
    if (isLimitFileSizeError(error)) {
      return next(
        new HttpError(
          413,
          'FILE_TOO_LARGE' as ErrorCode,
          'El archivo supera el tamano maximo permitido.'
        )
      )
    }

    next(error as any)
  })
}

function isLimitFileSizeError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'LIMIT_FILE_SIZE'
  )
}
