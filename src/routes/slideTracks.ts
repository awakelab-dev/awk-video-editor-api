import { Request, Response, Router } from "express";
import { ZodError } from "zod";
import {
  generateSlideTracks,
  SlideGenerationError,
  summarizeTextToSlides,
} from "../modules/slides/slideTracks.service";
import {
  CreateSlideTracksInput,
  createSlideTracksSchema,
} from "../modules/slides/slideTracks.schemas";
import { persistGeneratedProject } from "../modules/slides/slideTracks.persistence";

type SummarizeSlidesFn = (payload: CreateSlideTracksInput) => Promise<
  Array<{
    title: string;
    subtitle: string;
    body: string;
    bullets: string[];
    takeaway: string;
    sourceNote: string;
  }>
>;

type GeneratedSlideTracksResult = Awaited<
  ReturnType<typeof generateSlideTracks>
>;

type PersistProjectFn = (
  generated: GeneratedSlideTracksResult,
) => Promise<{ projectId: string }>;

export function createSlideTracksRouter(
  summarizeSlidesFn: SummarizeSlidesFn = summarizeTextToSlides,
  persistProjectFn: PersistProjectFn = persistGeneratedProject,
): Router {
  const router = Router();

  router.post("/slide-tracks", async (req: Request, res: Response) => {
    try {
      const payload = createSlideTracksSchema.parse(req.body);
      const result = await generateSlideTracks(payload, summarizeSlidesFn);
      const { projectId } = await persistProjectFn(result);

      return res.status(201).json({
        success: true,
        message: "Slide tracks generated and project created successfully",
        data: {
          projectId,
          ...result,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(422).json({
          success: false,
          message: "Validation failed",
          errors: error.issues.map((issue) => ({
            field: issue.path.join(".") || undefined,
            message: issue.message,
          })),
        });
      }

      if (
        error instanceof Error &&
        error.message.includes("MongoDB is not connected")
      ) {
        return res.status(503).json({
          success: false,
          message: "MongoDB is not connected",
        });
      }

      if (error instanceof SlideGenerationError) {
        const message = error.message;
        const statusCode = message.includes("OPENAI_API_KEY") ? 503 : 502;
        return res.status(statusCode).json({
          success: false,
          message,
        });
      }

      console.error("Error generating slide tracks:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  });

  return router;
}

export default createSlideTracksRouter();
