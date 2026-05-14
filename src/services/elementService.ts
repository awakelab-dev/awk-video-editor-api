import { ObjectId } from "mongodb";
import { getDb } from "../db/mongoClient";
import { createDefaultProjectTracks } from "../domain/projects";
import { HttpError } from "../errors/HttpError";
import {
  AnyElement,
  ElementDoc,
  ElementResponse,
  FrontendElementInput,
  GenericElementResponse,
  LegacyTextElementDoc,
  PersistedElementDoc,
  TextElement,
  TextElementDoc,
  TextElementInput,
  TextElementResponse
} from "../types/element";
import {
  insertElement
} from "../repositories/elementRepository";

type StoredTrack = {
  id: string;
  name: string;
  type?: string;
  elementIds: string[];
  elements?: Record<string, unknown>[];
  [key: string]: unknown;
};

type ProjectElementCreateResult = {
  projectId: string;
  elementId: string;
  type: string;
  revision: number;
  sessionId?: string | null;
};

const isPersistedElementDoc = (doc: ElementDoc): doc is PersistedElementDoc => {
  return "data" in doc;
};

const isTextElement = (element: AnyElement): element is TextElement => {
  return element.type === "text";
};

function toLegacyTextResponse(doc: LegacyTextElementDoc): TextElementResponse {
  return {
    _id: doc._id.toHexString(),
    projectId: doc.projectId,
    type: doc.type,
    content: doc.content,
    position: doc.position,
    timing: doc.timing,
    trackId: doc.trackId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

function toTextResponse(doc: PersistedElementDoc): TextElementResponse {
  const element = doc.data;

  if (!isTextElement(element)) {
    throw new Error("Expected a text element document");
  }

  return {
    _id: doc._id.toHexString(),
    projectId: doc.projectId,
    type: "text",
    content: element.text,
    position: {
      x: element.x,
      y: element.y
    },
    timing: {
      start: element.startTime,
      end: element.startTime + element.duration
    },
    trackId: doc.trackId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

function toGenericResponse(doc: PersistedElementDoc): GenericElementResponse {
  return {
    _id: doc._id.toHexString(),
    projectId: doc.projectId,
    trackId: doc.trackId,
    ...doc.data,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

function toResponse(doc: TextElementDoc): ElementResponse {
  if (!isPersistedElementDoc(doc)) {
    return toLegacyTextResponse(doc);
  }

  if (doc.type === "text") {
    return toTextResponse(doc);
  }

  return toGenericResponse(doc);
}

export function transformFrontendInput(
  input: TextElement,
  trackId: string
): TextElementInput {
  return {
    type: "text",
    content: input.text,
    position: {
      x: input.x,
      y: input.y
    },
    timing: {
      start: input.startTime,
      end: input.startTime + input.duration
    },
    trackId
  };
}

async function createTextElement(
  projectId: string,
  input: TextElementInput
): Promise<TextElementResponse> {
  const now = new Date();

  const doc: LegacyTextElementDoc = {
    _id: new ObjectId(),
    projectId,
    type: input.type,
    content: input.content,
    position: input.position,
    timing: input.timing,
    trackId: input.trackId,
    createdAt: now,
    updatedAt: now
  };

  await insertElement(doc);
  return toLegacyTextResponse(doc);
}

async function addElementToProject(
  projectId: string,
  doc: PersistedElementDoc
): Promise<ProjectElementCreateResult> {
  const db = getDb();
  const elementId = doc._id.toHexString();
  const now = new Date().toISOString();
  const editorStatesCollection = db.collection("editor_states");
  const projectElement = {
    ...doc.data,
    id: elementId,
    trackId: doc.trackId,
    createdAt: now,
    updatedAt: now
  };

  const projectsCollection = db.collection("projects");
  const project = await projectsCollection.findOne({ id: projectId });
  const editorState = await editorStatesCollection.findOne({ projectId });

  if (!project) {
    throw new HttpError(404, "NOT_FOUND", "Project not found", []);
  }

  const tracks = normalizeStoredTracks(project.tracks);
  const trackIndex = tracks.findIndex((track) => track.id === doc.trackId);

  if (trackIndex < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Validation error", [
      `trackId ${doc.trackId} does not exist`
    ]);
  }

  const elements =
    typeof project.elements === "object" && project.elements !== null && !Array.isArray(project.elements)
      ? { ...(project.elements as Record<string, unknown>) }
      : {};

  elements[elementId] = projectElement;

  const track = tracks[trackIndex];
  const currentElementIds = track.elementIds.filter((currentId) => currentId !== elementId);
  const currentElements = Array.isArray(track.elements)
    ? track.elements.filter((element) => element.id !== elementId)
    : [];

  tracks[trackIndex] = {
    ...track,
    elementIds: [...currentElementIds, elementId],
    elements: [...currentElements, projectElement]
  };

  const currentProjectRevision = typeof project.revision === "number" ? project.revision : 0;
  const currentEditorRevision =
    editorState && typeof editorState.revision === "number" ? editorState.revision : 0;
  const revision = Math.max(currentProjectRevision, currentEditorRevision) + 1;
  const sessionId = editorState?.sessionId ?? project.sessionId ?? `session_${projectId}`;

  await projectsCollection.updateOne(
    { id: projectId },
    {
      $set: {
        elements,
        tracks,
        updatedAt: now,
        revision
      }
    }
  );

  const editorTracks = addProjectElementToTracks(
    normalizeStoredTracks(editorState?.tracks),
    doc.trackId,
    elementId,
    projectElement
  );

  const editorSelection =
    typeof editorState?.selection === "object" && editorState.selection !== null
      ? editorState.selection
      : project.selection;

  await editorStatesCollection.updateOne(
    { projectId },
    {
      $set: {
        projectId,
        revision,
        sessionId,
        playback: editorState?.playback ?? project.playback ?? {
          currentTime: 0,
          isPlaying: false,
          zoomLevel: 100
        },
        selection: {
          ...(typeof editorSelection === "object" && editorSelection !== null ? editorSelection : {}),
          selectedElementId: elementId,
          selectionSource: "element-library"
        },
        assets: Array.isArray(editorState?.assets) ? editorState.assets : [],
        tracks: editorTracks,
        updatedAt: now,
        updatedBy: "system"
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return {
    projectId,
    elementId,
    type: doc.type,
    revision,
    sessionId
  };
}

function addProjectElementToTracks(
  tracks: StoredTrack[],
  trackId: string,
  elementId: string,
  projectElement: Record<string, unknown>
): StoredTrack[] {
  const nextTracks = tracks.map((track) => ({ ...track }));
  const trackIndex = nextTracks.findIndex((track) => track.id === trackId);

  if (trackIndex < 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Validation error", [
      `trackId ${trackId} does not exist`
    ]);
  }

  const track = nextTracks[trackIndex];
  const currentElementIds = track.elementIds.filter((currentId) => currentId !== elementId);
  const currentElements = Array.isArray(track.elements)
    ? track.elements.filter((element) => element.id !== elementId)
    : [];

  nextTracks[trackIndex] = {
    ...track,
    elementIds: [...currentElementIds, elementId],
    elements: [...currentElements, projectElement]
  };

  return nextTracks;
}

function normalizeStoredTracks(value: unknown): StoredTrack[] {
  const rawTracks = Array.isArray(value) ? value : [];
  const tracks = rawTracks
    .filter((track): track is Record<string, unknown> => {
      return typeof track === "object" && track !== null && !Array.isArray(track);
    })
    .map((track): StoredTrack => ({
      ...track,
      id: typeof track.id === "string" ? track.id : "track-media",
      name: typeof track.name === "string" ? track.name : String(track.id ?? "Media"),
      type: typeof track.type === "string" ? track.type : undefined,
      elementIds: getStoredTrackElementIds(track),
      elements: Array.isArray(track.elements)
        ? track.elements.filter((element): element is Record<string, unknown> => {
            return typeof element === "object" && element !== null && !Array.isArray(element);
          })
        : []
    }));

  for (const defaultTrack of createDefaultProjectTracks()) {
    if (!tracks.some((track) => track.id === defaultTrack.id)) {
      tracks.push({
        ...defaultTrack,
        elements: []
      });
    }
  }

  return tracks;
}

function getStoredTrackElementIds(track: Record<string, unknown>): string[] {
  if (Array.isArray(track.elementIds)) {
    const elementIds = track.elementIds.filter((value): value is string => typeof value === "string");
    if (elementIds.length > 0) {
      return [...new Set(elementIds)];
    }
  }

  if (!Array.isArray(track.elements)) {
    return [];
  }

  return [
    ...new Set(
      track.elements
        .filter((element): element is Record<string, unknown> => {
          return typeof element === "object" && element !== null && !Array.isArray(element);
        })
        .map((element) => element.id)
        .filter((value): value is string => typeof value === "string")
    )
  ];
}

async function ensureProjectTrackExists(projectId: string, trackId: string): Promise<void> {
  const db = getDb();
  const project = await db.collection("projects").findOne(
    { id: projectId },
    { projection: { tracks: 1 } }
  );

  if (!project) {
    throw new HttpError(404, "NOT_FOUND", "Project not found", []);
  }

  const hasTrack = normalizeStoredTracks(project.tracks).some((track) => track.id === trackId);
  if (!hasTrack) {
    throw new HttpError(400, "VALIDATION_ERROR", "Validation error", [
      `trackId ${trackId} does not exist`
    ]);
  }
}

export async function createElement(
  projectId: string,
  input: AnyElement,
  trackId: string
): Promise<ProjectElementCreateResult> {
  await ensureProjectTrackExists(projectId, trackId);

  const now = new Date();

  const doc: PersistedElementDoc = {
    _id: new ObjectId(),
    projectId,
    trackId,
    type: input.type,
    data: input,
    createdAt: now,
    updatedAt: now
  };

  await insertElement(doc);
  return addElementToProject(projectId, doc);
}

export async function createElementFromFrontend(
  projectId: string,
  input: FrontendElementInput,
  trackId: string
): Promise<ProjectElementCreateResult> {
  return createElement(projectId, input, trackId);
}

export async function getElementsByProjectId(
  projectId: string
): Promise<ElementResponse[]> {
  const db = getDb();
  const project = await db.collection("projects").findOne({ id: projectId });
  if (!project || typeof project.elements !== "object" || project.elements === null) {
    return [];
  }

  return Object.values(project.elements) as ElementResponse[];
}
