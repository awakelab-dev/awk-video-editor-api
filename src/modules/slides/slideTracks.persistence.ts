import { getMongoDb, isMongoConnected } from "../../config/mongodb";
import {
  buildInitialEditorState,
  generateProjectId,
  type ProjectDocument,
  type ProjectElement,
  type ProjectTrack,
} from "../../domain/projects";
import { generateSlideTracks } from "./slideTracks.service";

type GeneratedSlideTracksResult = Awaited<
  ReturnType<typeof generateSlideTracks>
>;

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

async function insertProjectDocument(
  project: ProjectDocument,
): Promise<{ projectId: string }> {
  if (!isMongoConnected()) {
    throw new Error("MongoDB is not connected");
  }

  const db = getMongoDb();
  if (!db) {
    throw new Error("MongoDB is not connected");
  }

  const projectsCollection: any = db.collection("projects");
  const editorStatesCollection: any = db.collection("editor_states");
  const now = new Date().toISOString();

  await projectsCollection.insertOne(project);

  const initialEditorState = buildInitialEditorState(project);
  await editorStatesCollection.updateOne(
    { projectId: project.id },
    {
      $set: {
        ...initialEditorState,
        revision: 0,
        sessionId: project.sessionId ?? `session_${project.id}`,
        updatedBy: "system",
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  return { projectId: project.id };
}

export async function persistGeneratedProject(
  generated: GeneratedSlideTracksResult,
): Promise<{ projectId: string }> {
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

  return insertProjectDocument(project);
}

export async function persistProjectDocument(
  project: ProjectDocument,
): Promise<{ projectId: string }> {
  return insertProjectDocument(project);
}
