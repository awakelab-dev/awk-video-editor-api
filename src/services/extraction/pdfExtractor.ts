import { HttpError } from '../../errors/HttpError'
import type { ErrorCode } from '../../utils/response'

type PdfParseResult = {
  text?: string
}

type PdfParseFunction = (buffer: Buffer) => Promise<PdfParseResult>

declare const require: (moduleName: string) => unknown

const pdfParse = require('pdf-parse') as PdfParseFunction

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer)
    return typeof result.text === 'string' ? result.text : ''
  } catch {
    throw new HttpError(
      422,
      'PDF_PARSE_ERROR' as ErrorCode,
      'No se pudo leer el PDF enviado.'
    )
  }
}
