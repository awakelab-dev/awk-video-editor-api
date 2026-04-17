import { ObjectId } from "mongodb";
import {
  AnyElement,
  ElementDoc,
  ElementResponse,
  FrontendElementInput,
  FrontendTextElementInput,
  GenericElementResponse,
  LegacyTextElementDoc,
  PersistedElementDoc,
  TextElement,
  TextElementDoc,
  TextElementInput,
  TextElementResponse
} from "../types/textElement";
import {
  findTextElementsByProjectId,
  insertTextElement
} from "../repositories/textElementRepository";

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
  input: FrontendTextElementInput,
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

export async function createTextElement(
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

  await insertTextElement(doc);
  return toLegacyTextResponse(doc);
}

export async function createElement(
  projectId: string,
  input: AnyElement,
  trackId: string
): Promise<ElementResponse> {
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

  await insertTextElement(doc);
  return toResponse(doc);
}

export async function createElementFromFrontend(
  projectId: string,
  input: FrontendElementInput,
  trackId: string
): Promise<ElementResponse> {
  return createElement(projectId, input, trackId);
}

export async function createTextElementFromFrontend(
  projectId: string,
  input: FrontendTextElementInput,
  trackId: string
): Promise<TextElementResponse> {
  const response = await createElementFromFrontend(projectId, input, trackId);
  return response as TextElementResponse;
}

export async function getTextElementsByProjectId(
  projectId: string
): Promise<ElementResponse[]> {
  const docs = await findTextElementsByProjectId(projectId);
  return docs.map(toResponse);
}
