import OpenAI from 'openai'
import dotenv from 'dotenv'
import { HttpError } from '../../errors/HttpError'
import { buildSummarizeInput, buildSummarizeInstructions } from '../../prompts/summarize'
import { SummaryResponse } from '../../types/summary'
import { cleanInlineText, cleanParagraphText } from '../../utils/cleanText'
import type { ErrorCode } from '../../utils/response'
import {
  MAX_BULLETS_PER_SLIDE,
  MAX_KEYWORDS_PER_SLIDE,
  MAX_MODEL_OUTPUT_TOKENS,
  MAX_SLIDES,
  OPENAI_SUMMARY_MODEL,
} from '../../utils/summarizeConstants'
import { summaryResponseSchema } from '../../validation/summarySchema'
import { normalizeKeywords } from '../keywords/keywordPostProcessor'

dotenv.config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function summarizeEducationalContent(sourceText: string): Promise<SummaryResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new HttpError(
      500,
      'OPENAI_NOT_CONFIGURED' as ErrorCode,
      'OPENAI_API_KEY no esta configurada.'
    )
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const isRetry = attempt === 1

    try {
      const response = await openai.responses.create({
        model: OPENAI_SUMMARY_MODEL,
        reasoning: {
          effort: 'low',
        },
        max_output_tokens: MAX_MODEL_OUTPUT_TOKENS,
        input: [
          {
            role: 'system',
            content: buildSummarizeInstructions({ isRetry }),
          },
          {
            role: 'user',
            content: buildSummarizeInput(sourceText),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'educational_summary',
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                slides: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      slideNumber: { type: 'number' },
                      title: { type: 'string' },
                      summary: { type: 'string' },
                      bullets: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      keywords: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      speakerNotes: { type: 'string' },
                    },
                    required: [
                      'slideNumber',
                      'title',
                      'summary',
                      'bullets',
                      'keywords',
                      'speakerNotes',
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ['title', 'slides'],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      })

      const outputText = extractOutputText(response)
      return parseAndNormalizeSummary(outputText)
    } catch (error) {
      if (isInvalidModelOutput(error)) {
        if (!isRetry) {
          continue
        }

        throw new HttpError(
          502,
          'MODEL_OUTPUT_INVALID' as ErrorCode,
          'OpenAI devolvio una salida no valida en dos intentos.'
        )
      }

      throw mapOpenAIError(error)
    }
  }

  throw new HttpError(
    500,
    'UNREACHABLE_SUMMARY_STATE' as ErrorCode,
    'Estado inesperado al resumir el contenido.'
  )
}

function parseAndNormalizeSummary(outputText: string): SummaryResponse {
  if (!outputText.trim()) {
    throw new HttpError(
      502,
      'EMPTY_MODEL_OUTPUT' as ErrorCode,
      'OpenAI devolvio una respuesta vacia.'
    )
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(outputText)
  } catch {
    throw new HttpError(
      502,
      'MODEL_OUTPUT_NOT_JSON' as ErrorCode,
      'La salida del modelo no fue JSON valido.'
    )
  }

  const validated = summaryResponseSchema.parse(parsed)

  return {
    title: cleanInlineText(validated.title, 140),
    slides: validated.slides.slice(0, MAX_SLIDES).map((slide, index) => ({
      slideNumber: index + 1,
      title: cleanInlineText(slide.title, 120),
      summary: cleanParagraphText(slide.summary, 280),
      bullets: slide.bullets
        .slice(0, MAX_BULLETS_PER_SLIDE)
        .map((bullet) => cleanParagraphText(bullet, 140))
        .filter((bullet) => bullet.length > 0),
      keywords: normalizeKeywords(slide.keywords).slice(0, MAX_KEYWORDS_PER_SLIDE),
      speakerNotes: cleanParagraphText(slide.speakerNotes, 320),
    })),
  }
}

function extractOutputText(response: unknown): string {
  const directOutputText = getValidText(isRecord(response) ? response.output_text : undefined)
  if (directOutputText) {
    return directOutputText
  }

  const nestedOutputText = extractTextFromOutputItems(isRecord(response) ? response.output : undefined)
  if (nestedOutputText) {
    return nestedOutputText
  }

  throw new HttpError(
    502,
    'EMPTY_MODEL_OUTPUT' as ErrorCode,
    'OpenAI devolvio una respuesta vacia.'
  )
}

function extractTextFromOutputItems(output: unknown): string | null {
  if (!Array.isArray(output)) {
    return null
  }

  for (const item of output) {
    const candidate = extractTextFromOutputItem(item)
    if (candidate) {
      return candidate
    }
  }

  return null
}

function extractTextFromOutputItem(item: unknown): string | null {
  if (!isRecord(item)) {
    return null
  }

  const directText = getValidText(item.text)
  if (directText) {
    return directText
  }

  if (!Array.isArray(item.content)) {
    return null
  }

  for (const contentPart of item.content) {
    const candidate = extractTextFromContentPart(contentPart)
    if (candidate) {
      return candidate
    }
  }

  return null
}

function extractTextFromContentPart(contentPart: unknown): string | null {
  if (typeof contentPart === 'string') {
    return getValidText(contentPart)
  }

  if (!isRecord(contentPart)) {
    return null
  }

  const directText = getValidText(contentPart.text)
  if (directText) {
    return directText
  }

  if (isRecord(contentPart.text)) {
    const nestedText =
      getValidText(contentPart.text.value) ?? getValidText(contentPart.text.content)

    if (nestedText) {
      return nestedText
    }
  }

  return null
}

function getValidText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isInvalidModelOutput(error: unknown): boolean {
  if (error instanceof HttpError) {
    const errorCode = error.code as string
    return errorCode === 'EMPTY_MODEL_OUTPUT' || errorCode === 'MODEL_OUTPUT_NOT_JSON'
  }

  return error instanceof Error && error.name === 'ZodError'
}

function mapOpenAIError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof OpenAI.APIError) {
    return new HttpError(
      error.status ?? 502,
      'OPENAI_API_ERROR' as ErrorCode,
      error.message || 'Fallo la llamada a OpenAI.'
    )
  }

  return new HttpError(
    500,
    'INTERNAL_SUMMARY_ERROR' as ErrorCode,
    'No se pudo generar el resumen.'
  )
}
