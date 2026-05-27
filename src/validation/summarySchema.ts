import { z } from 'zod'
import { MAX_BULLETS_PER_SLIDE, MAX_KEYWORDS_PER_SLIDE, MAX_SLIDES } from '../utils/summarizeConstants'

const slideSchema = z
  .object({
    slideNumber: z.number().int().min(1).max(MAX_SLIDES),
    title: z.string().trim().min(1).max(140),
    summary: z.string().trim().min(1).max(320),
    bullets: z.array(z.string().trim().min(1).max(160)).min(1).max(MAX_BULLETS_PER_SLIDE),
    keywords: z.array(z.string().trim().min(1).max(60)).min(3).max(MAX_KEYWORDS_PER_SLIDE),
    speakerNotes: z.string().trim().min(1).max(400),
  })
  .strict()

export const summaryResponseSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    slides: z.array(slideSchema).min(1).max(MAX_SLIDES),
  })
  .strict()
