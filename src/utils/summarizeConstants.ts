export const MAX_SLIDES = 8
export const MAX_BULLETS_PER_SLIDE = 5
export const MAX_KEYWORDS_PER_SLIDE = 6
export const MAX_MODEL_OUTPUT_TOKENS = 2000
export const MAX_SOURCE_INPUT_CHARS = 14000
export const MAX_DOCUMENT_BLOCKS = 18
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
export const OPENAI_SUMMARY_MODEL = 'gpt-5-mini'

export const SUPPORTED_TEXT_MIME_TYPES = new Set<string>([
  'text/plain',
  'text/markdown',
  'application/json',
])

export const SUPPORTED_TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json']
