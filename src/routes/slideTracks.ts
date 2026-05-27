import { Request, Response, Router } from "express";
import { ZodError } from "zod";
import { getMongoDb, isMongoConnected } from "../config/mongodb";
import {
  buildInitialEditorState,
  generateProjectId,
  type ProjectDocument,
  type ProjectElement,
  type ProjectTrack,
} from "../domain/projects";
import {
  generateSlideTracks,
  SlideGenerationError,
  summarizeTextToSlides,
} from "../modules/slides/slideTracks.service";
import {
  CreateSlideTracksInput,
  createSlideTracksSchema,
} from "../modules/slides/slideTracks.schemas";

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

type PersistProjectFn = (payload: {
  input: CreateSlideTracksInput;
  generated: GeneratedSlideTracksResult;
}) => Promise<{ projectId: string }>;

function normalizeProjectName(title: string | undefined): string {
  const normalized = (title ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Proyecto generado desde slide-tracks";
  }

  return normalized.slice(0, 120);
}

function mapTrackType(kind: string): ProjectTrack["type"] {
  if (kind === "text" || kind === "audio") {
    return kind;
  }

  return "mixed";
}

function buildProjectTracks(
  generatedTracks: GeneratedSlideTracksResult["tracks"],
): ProjectTrack[] {
  return generatedTracks.map((track) => ({
    id: track.id,
    name: track.name,
    type: mapTrackType(track.kind),
    elementIds: track.elements.map((element) => element.id),
  }));
}

function buildProjectElements(
  generatedTracks: GeneratedSlideTracksResult["tracks"],
): Record<string, ProjectElement> {
  const elements: Record<string, ProjectElement> = {};

  for (const track of generatedTracks) {
    for (const element of track.elements) {
      elements[element.id] = {
        ...element,
        trackId: track.id,
      };
    }
  }

  return elements;
}

function hasTextValue(element: unknown): element is { text: string } {
  return (
    typeof element === "object" &&
    element !== null &&
    "text" in element &&
    typeof (element as { text?: unknown }).text === "string"
  );
}

async function persistGeneratedProject({
  generated,
}: {
  input: CreateSlideTracksInput;
  generated: GeneratedSlideTracksResult;
}): Promise<{ projectId: string }> {
  if (!isMongoConnected()) {
    throw new Error("MongoDB is not connected");
  }

  const db = getMongoDb();
  if (!db) {
    throw new Error("MongoDB is not connected");
  }

  const projectsCollection: any = db.collection("projects");
  const editorStatesCollection: any = db.collection("editor_states");
  const projectId = generateProjectId();
  const now = new Date().toISOString();
  const firstTextElement = generated.tracks.find(
    (track) => track.id === "track_text",
  )?.elements[0];
  const projectName = normalizeProjectName(
    hasTextValue(firstTextElement) ? firstTextElement.text : undefined,
  );

  const project: ProjectDocument = {
    id: projectId,
    name: projectName,
    duration: generated.durationSeconds,
    resolution: generated.resolution,
    revision: 0,
    sessionId: `session_${projectId}`,
    playback: {
      currentTime: 0,
      isPlaying: false,
      zoomLevel: 100,
    },
    selection: {
      selectedElementId: null,
      selectedTrackId: null,
      selectionSource: null,
    },
    assets: {},
    tracks: buildProjectTracks(generated.tracks),
    elements: buildProjectElements(generated.tracks),
    createdAt: now,
    updatedAt: now,
  };

  await projectsCollection.insertOne(project);

  const initialEditorState = buildInitialEditorState(project);
  await editorStatesCollection.updateOne(
    { projectId },
    {
      $set: {
        ...initialEditorState,
        revision: 0,
        sessionId: `session_${projectId}`,
        updatedBy: "system",
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  return { projectId };
}

export function createSlideTracksRouter(
  summarizeSlidesFn: SummarizeSlidesFn = summarizeTextToSlides,
  persistProjectFn: PersistProjectFn = persistGeneratedProject,
): Router {
  const router = Router();

  router.post("/slide-tracks", async (req: Request, res: Response) => {
    try {
      const payload = createSlideTracksSchema.parse(req.body);
      const result = await generateSlideTracks(payload, summarizeSlidesFn);
      const { projectId } = await persistProjectFn({
        input: payload,
        generated: result,
      });

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
