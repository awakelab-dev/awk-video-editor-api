import { HttpError } from '../../errors/HttpError'
import type { ExtractedSource, UploadedFile } from '../../types/summary'
import type { ErrorCode } from '../../utils/response'
import { normalizeSourceText } from '../../utils/cleanText'
import {
  MAX_SOURCE_INPUT_CHARS,
  SUPPORTED_TEXT_EXTENSIONS,
  SUPPORTED_TEXT_MIME_TYPES,
} from '../../utils/summarizeConstants'
import { truncateDocumentText } from '../../utils/documentTruncation'
import { extractTextFromPdfBuffer } from './pdfExtractor'
import { extractTextFromPlainBuffer } from './plainTextExtractor'

type ExtractionInput = {
  file?: UploadedFile
  text?: string
}

export async function extractSourceContent(input: ExtractionInput): Promise<ExtractedSource> {
  if (input.file) {
    return extractUploadedFile(input.file)
  }

  if (typeof input.text === 'string') {
    return extractDirectText(input.text)
  }

  throw new HttpError(
    400,
    'MISSING_INPUT' as ErrorCode,
    'Debes enviar `text` en JSON o `file` en multipart/form-data.'
  )
}

async function extractUploadedFile(file: UploadedFile): Promise<ExtractedSource> {
  const mimeType = file.mimetype.toLowerCase()

  if (mimeType === 'application/pdf') {
    const extractedText = await extractTextFromPdfBuffer(file.buffer)
    return finalizeExtractedSource(extractedText, {
      sourceType: 'pdf',
      fileName: file.originalname,
      mimeType,
    })
  }

  if (SUPPORTED_TEXT_MIME_TYPES.has(mimeType) || hasSupportedTextExtension(file.originalname)) {
    const extractedText = extractTextFromPlainBuffer(file.buffer)
    return finalizeExtractedSource(extractedText, {
      sourceType: 'text_file',
      fileName: file.originalname,
      mimeType,
    })
  }

  throw new HttpError(
    415,
    'UNSUPPORTED_FILE_TYPE' as ErrorCode,
    'Solo se admiten archivos PDF o texto plano por ahora.'
  )
}

function extractDirectText(text: string): ExtractedSource {
  return finalizeExtractedSource(text, {
    sourceType: 'direct_text',
  })
}

function finalizeExtractedSource(
  rawText: string,
  context: {
    sourceType: ExtractedSource['sourceType']
    fileName?: string
    mimeType?: string
  }
): ExtractedSource {
  const normalizedText = normalizeSourceText(rawText)

  if (!normalizedText) {
    throw new HttpError(
      422,
      'EMPTY_CONTENT' as ErrorCode,
      'No se pudo extraer contenido textual util.'
    )
  }

  const truncated = truncateDocumentText(normalizedText, {
    maxChars: MAX_SOURCE_INPUT_CHARS,
  })

  if (!truncated.text) {
    throw new HttpError(
      422,
      'EMPTY_CONTENT' as ErrorCode,
      'El contenido extraido no es util para resumir.'
    )
  }

  return {
    cleanedText: truncated.text,
    fileName: context.fileName,
    mimeType: context.mimeType,
    originalLength: normalizedText.length,
    sourceType: context.sourceType,
    truncated: truncated.wasTruncated,
    usedLength: truncated.text.length,
  }
}

function hasSupportedTextExtension(fileName: string): boolean {
  const normalizedName = fileName.toLowerCase()
  return SUPPORTED_TEXT_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
}
