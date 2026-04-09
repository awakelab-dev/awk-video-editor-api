import { ObjectId } from "mongodb";
import {
  FrontendTextElementInput,
  TextElementDoc,
  TextElementInput,
  TextElementResponse
} from "../types/textElement";
import {
  findTextElementsByProjectId,
  insertTextElement
} from "../repositories/textElementRepository";

function toResponse(doc: TextElementDoc): TextElementResponse {
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

  const doc: TextElementDoc = {
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
  return toResponse(doc);
}

export async function createTextElementFromFrontend(
  projectId: string,
  input: FrontendTextElementInput,
  trackId: string
): Promise<TextElementResponse> {
  const internalInput = transformFrontendInput(input, trackId);
  return createTextElement(projectId, internalInput);
}

export async function getTextElementsByProjectId(
  projectId: string
): Promise<TextElementResponse[]> {
  const docs = await findTextElementsByProjectId(projectId);
  return docs.map(toResponse);
}
