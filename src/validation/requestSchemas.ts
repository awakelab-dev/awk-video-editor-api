import { z } from 'zod'

export const summarizeJsonBodySchema = z
  .object({
    text: z.string().trim().min(1).max(200000),
  })
  .strict()
