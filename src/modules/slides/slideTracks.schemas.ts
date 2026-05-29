import { z } from "zod";

export const createSlideTracksSchema = z
  .object({
    text: z.string().trim().min(120).max(120000),
    language: z.enum(["es", "en"]).default("es"),
    maxSlides: z.number().int().min(3).max(15).default(10),
  })
  .strict();

export const aiSlideSchema = z
  .object({
    slides: z
      .array(
        z
          .object({
            layout: z
              .enum([
                "cover",
                "objective",
                "concept",
                "comparison",
                "flow",
                "example",
                "recap",
                "closing",
              ])
              .optional(),
            title: z.string().trim().min(1),
            subtitle: z.string().trim().min(1),
            body: z.string().trim().min(1),
            bullets: z.array(z.string().trim().min(1)).min(3).max(3),
            takeaway: z.string().trim().min(1),
            sourceNote: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type CreateSlideTracksInput = z.infer<typeof createSlideTracksSchema>;
export type AiSlideOutput = z.infer<typeof aiSlideSchema>;
