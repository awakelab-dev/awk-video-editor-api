import { ObjectId } from "mongodb";
import { getDb } from "../db/mongoClient";
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
): Promise<void> {
  const db = getDb();
  const elementId = doc._id.toHexString();
  const now = new Date().toISOString();
  const projectElement = {
    ...doc.data,
    id: elementId,
    trackId: doc.trackId,
    createdAt: now,
    updatedAt: now
  };

  const result = await db.collection("projects").updateOne(
    { id: projectId },
    [
      {
        $set: {
          elements: {
            $mergeObjects: [
              {
                $cond: [
                  {
                    $eq: [{ $type: "$elements" }, "object"]
                  },
                  "$elements",
                  {}
                ]
              },
              {
                [elementId]: projectElement
              }
            ]
          },
          tracks: {
            $let: {
              vars: {
                existingTracks: {
                  $cond: [{ $isArray: "$tracks" }, "$tracks", []]
                }
              },
              in: {
                $cond: [
                  {
                    $in: [
                      doc.trackId,
                      {
                        $map: {
                          input: "$$existingTracks",
                          as: "track",
                          in: "$$track.id"
                        }
                      }
                    ]
                  },
                  {
                    $map: {
                      input: "$$existingTracks",
                      as: "track",
                      in: {
                        $cond: [
                          {
                            $eq: ["$$track.id", doc.trackId]
                          },
                          {
                            $mergeObjects: [
                              "$$track",
                              {
                                elementIds: {
                                  $concatArrays: [
                                    {
                                      $cond: [
                                        { $isArray: "$$track.elementIds" },
                                        "$$track.elementIds",
                                        []
                                      ]
                                    },
                                    [elementId]
                                  ]
                                },
                                elements: {
                                  $concatArrays: [
                                    {
                                      $cond: [
                                        { $isArray: "$$track.elements" },
                                        "$$track.elements",
                                        []
                                      ]
                                    },
                                    [projectElement]
                                  ]
                                }
                              }
                            ]
                          },
                          "$$track"
                        ]
                      }
                    }
                  },
                  {
                    $concatArrays: [
                      "$$existingTracks",
                      [
                        {
                          id: doc.trackId,
                          name: doc.trackId,
                          type: doc.type,
                          elementIds: [elementId],
                          elements: [projectElement]
                        }
                      ]
                    ]
                  }
                ]
              }
            }
          },
          updatedAt: now,
          revision: {
            $add: [{ $ifNull: ["$revision", 0] }, 1]
          }
        }
      }
    ]
  );

  if (result.matchedCount === 0) {
    console.warn(
      `[addElementToProject] Project not found: ${projectId}`
    );
  }
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

  await insertElement(doc);
  console.log("ADDING TO PROJECT", projectId);
  await addElementToProject(projectId, doc);
  console.log("PROJECT UPDATE RESULT");

  return toResponse(doc);
}

export async function createElementFromFrontend(
  projectId: string,
  input: FrontendElementInput,
  trackId: string
): Promise<ElementResponse> {
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
