import { z } from "zod";

export const slidePlanRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(50000),
    title: z.string().trim().min(1).max(120).optional(),
    audience: z.string().trim().min(1).max(120).optional(),
    tone: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export type SlidePlanRequestInput = z.infer<typeof slidePlanRequestSchema>;
