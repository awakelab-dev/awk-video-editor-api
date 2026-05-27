import { Request, Response, Router } from "express";
import multer from "multer";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ZodError } from "zod";
import {
  createSlideTracksSchema,
  type CreateSlideTracksInput,
} from "../modules/slides/slideTracks.schemas";
import {
  generateSlideTracks,
  SlideGenerationError,
  summarizeTextToSlides,
} from "../modules/slides/slideTracks.service";
import { persistGeneratedProject } from "../modules/slides/slideTracks.persistence";

type MulterRequest = Request & {
  file?: Express.Multer.File;
};

type ExtractPdfTextFn = (
  buffer: Buffer,
) => Promise<{ text: string; pages: number }>;

type SummarizeSlidesFn = (
  payload: CreateSlideTracksInput,
) => Promise<Awaited<ReturnType<typeof summarizeTextToSlides>>>;

type PersistProjectFn = (
  generated: Awaited<ReturnType<typeof generateSlideTracks>>,
) => Promise<{ projectId: string }>;

const upload = multer({
  storage: multer.memoryStorage(),
});

async function extractTextFromPdf(
  buffer: Buffer,
): Promise<{ text: string; pages: number }> {
  const uint8Array = new Uint8Array(buffer);
  const pdfjsPackagePath = require.resolve("pdfjs-dist/package.json");
  const standardFontDataUrl = pathToFileURL(
    path.join(path.dirname(pdfjsPackagePath), "standard_fonts"),
  ).href;
  const pdf = await pdfjsLib.getDocument({
    data: uint8Array,
    standardFontDataUrl: `${standardFontDataUrl}/`,
  }).promise;

  let text = "";

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }

  return {
    text,
    pages: pdf.numPages,
  };
}

function buildPdfRouteHandler(
  extractTextFn: ExtractPdfTextFn = extractTextFromPdf,
  summarizeSlidesFn: SummarizeSlidesFn = summarizeTextToSlides,
  persistProjectFn: PersistProjectFn = persistGeneratedProject,
) {
  return async (req: MulterRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const extracted = await extractTextFn(req.file.buffer);
      const payload = createSlideTracksSchema.parse({
        text: extracted.text,
      });
      const result = await generateSlideTracks(payload, summarizeSlidesFn);
      const { projectId } = await persistProjectFn(result);

      return res.status(201).json({
        success: true,
        message: "PDF processed and project created successfully",
        data: {
          projectId,
          filename: req.file.originalname,
          pages: extracted.pages,
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

      console.error("Error processing PDF:", error);
      return res.status(500).json({
        success: false,
        message: "Error processing PDF",
      });
    }
  };
}

export function createPdfToProjectRouter(
  extractTextFn: ExtractPdfTextFn = extractTextFromPdf,
  summarizeSlidesFn: SummarizeSlidesFn = summarizeTextToSlides,
  persistProjectFn: PersistProjectFn = persistGeneratedProject,
): Router {
  const router = Router();
  const handler = buildPdfRouteHandler(
    extractTextFn,
    summarizeSlidesFn,
    persistProjectFn,
  );

  router.post("/pdf-to-project", upload.single("file"), handler);
  router.post("/pdf-to-text", upload.single("file"), handler);

  return router;
}

export default createPdfToProjectRouter();
