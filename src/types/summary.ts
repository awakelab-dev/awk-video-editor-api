export type SourceType = 'direct_text' | 'pdf' | 'text_file'

export interface UploadedFile {
  buffer: Buffer
  encoding: string
  fieldname: string
  mimetype: string
  originalname: string
  size: number
}

export interface SummarizeRequestBody {
  text?: string
}

export interface ExtractedSource {
  cleanedText: string
  fileName?: string
  mimeType?: string
  originalLength: number
  sourceType: SourceType
  truncated: boolean
  usedLength: number
}

export interface SummarySlide {
  slideNumber: number
  title: string
  summary: string
  bullets: string[]
  keywords: string[]
  speakerNotes: string
}

export interface SummaryResponse {
  title: string
  slides: SummarySlide[]
}
