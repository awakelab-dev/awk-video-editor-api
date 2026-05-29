import { NextFunction, Request, Response, Router } from "express";
import { ZodError } from "zod";
import { extractSourceContent } from "../services/extraction/documentExtractionService";
import { summarizeEducationalContent } from "../services/summarization/openaiSummarizationService";
import {
  SummaryResponse,
  SummarizeRequestBody,
  UploadedFile,
} from "../types/summary";
import { uploadSingleDocument } from "../utils/upload";
import { summarizeJsonBodySchema } from "../validation/requestSchemas";
import { generateSlideTracksFromSummary } from "../modules/slides/slideTracks.service";
import { persistTemplateProjectFromSummary } from "../modules/slides/slideTemplateProject";

type SummarizeProjectRequest = Request<
  Record<string, never>,
  unknown,
  unknown
> & {
  file?: UploadedFile;
};

type GenerateTracksFromSummaryFn = (
  summary: SummaryResponse,
) => Promise<Awaited<ReturnType<typeof generateSlideTracksFromSummary>>>;

type PersistProjectFn = (
  summary: SummaryResponse,
  generated: Awaited<ReturnType<typeof generateSlideTracksFromSummary>>,
) => Promise<{ projectId: string }>;

function getBodyText(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const candidate = (body as SummarizeRequestBody).text;
  if (typeof candidate !== "string") {
    return undefined;
  }

  return summarizeJsonBodySchema.parse({ text: candidate }).text;
}

function toValidationError(error: ZodError): Error {
  const validationError = new Error("Validation failed") as Error & {
    status?: number;
    code?: string;
    details?: string[];
  };

  validationError.status = 422;
  validationError.code = "VALIDATION_ERROR";
  validationError.details = error.issues.map(
    (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`,
  );

  return validationError;
}

export function createSummarizeToProjectRouter(
  summarizeFn: typeof summarizeEducationalContent = summarizeEducationalContent,
  generateTracksFn: GenerateTracksFromSummaryFn = generateSlideTracksFromSummary,
  persistProjectFn: PersistProjectFn = async (summary) =>
    persistTemplateProjectFromSummary(summary),
): Router {
  const router = Router();

  router.post(
    "/summarize-to-project",
    uploadSingleDocument,
    async (
      request: SummarizeProjectRequest,
      response: Response,
      next: NextFunction,
    ) => {
      try {
        const bodyText = getBodyText(request.body);

        const extractedText = await extractSourceContent({
          file: request.file,
          text: bodyText,
        });

        const summary = await summarizeFn(extractedText.cleanedText);
        const generated = await generateTracksFn(summary);
        const { projectId } = await persistProjectFn(summary, generated);

        response.status(201).json({
          success: true,
          message:
            "Texto resumido, convertido a slides y guardado como proyecto.",
          data: {
            projectId,
            summary,
            ...generated,
          },
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return next(toValidationError(error));
        }

        if (
          error instanceof Error &&
          error.message.includes("MongoDB is not connected")
        ) {
          return response.status(503).json({
            success: false,
            message: "MongoDB is not connected",
          });
        }

        next(error);
      }
    },
  );

  return router;
}

export default createSummarizeToProjectRouter();
