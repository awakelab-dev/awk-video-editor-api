import { NextFunction, Request, Response, Router } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../errors/HttpError'
import { extractSourceContent } from '../services/extraction/documentExtractionService'
import { summarizeEducationalContent } from '../services/summarization/openaiSummarizationService'
import { SummarizeRequestBody, SummaryResponse, UploadedFile } from '../types/summary'
import { uploadSingleDocument } from '../utils/upload'
import { summarizeJsonBodySchema } from '../validation/requestSchemas'

type SummarizeRequest = Request<Record<string, never>, SummaryResponse, unknown> & {
  file?: UploadedFile
}

const router = Router()

router.post(
  '/summarize',
  uploadSingleDocument,
  async (request: SummarizeRequest, response: Response<SummaryResponse>, next: NextFunction) => {
    try {
      const bodyText = getBodyText(request.body)

      const extractedText = await extractSourceContent({
        file: request.file,
        text: bodyText,
      })

      const summary = await summarizeEducationalContent(extractedText.cleanedText)

      response.status(200).json(summary)
    } catch (error) {
      if (error instanceof ZodError) {
        return next(toValidationError(error))
      }

      next(error)
    }
  }
)

function getBodyText(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined
  }

  const candidate = (body as SummarizeRequestBody).text
  if (typeof candidate !== 'string') {
    return undefined
  }

  return summarizeJsonBodySchema.parse({ text: candidate }).text
}

function toValidationError(error: ZodError): HttpError {
  return new HttpError(
    422,
    'VALIDATION_ERROR',
    'Validation failed',
    error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
  )
}

export default router
