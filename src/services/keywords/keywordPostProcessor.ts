import { cleanInlineText } from '../../utils/cleanText'
import { MAX_KEYWORDS_PER_SLIDE } from '../../utils/summarizeConstants'

export function normalizeKeywords(keywords: string[]): string[] {
  const deduped = new Set<string>()

  for (const keyword of keywords) {
    const cleaned = cleanInlineText(keyword, 48)
      .toLowerCase()
      .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '')

    if (!cleaned) {
      continue
    }

    deduped.add(cleaned)

    if (deduped.size >= MAX_KEYWORDS_PER_SLIDE) {
      break
    }
  }

  return [...deduped]
}
