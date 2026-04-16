import { FrontendTextElementInput } from "../types/textElement";

const allowedKeys = [
  "id",
  "type",
  "name",
  "startTime",
  "duration",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "text",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "textColor",
  "backgroundColor",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "trackId"
] as const;

type AllowedKey = (typeof allowedKeys)[number];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const getUnknownKeys = (value: Record<string, unknown>): string[] => {
  return Object.keys(value).filter(
    (key) => !allowedKeys.includes(key as AllowedKey)
  );
};

export type ValidationResult =
  | { ok: true; value: FrontendTextElementInput }
  | { ok: false; errors: string[] };

export function validateFrontendTextElementInput(body: unknown): ValidationResult {
  if (!isRecord(body)) {
    return { ok: false, errors: ["Body must be an object"] };
  }

  const errors: string[] = [];
  const unknownKeys = getUnknownKeys(body);
  if (unknownKeys.length > 0) {
    errors.push(`Unknown field(s): ${unknownKeys.join(", ")}`);
  }

  if (!isNonEmptyString(body.id)) {
    errors.push("id is required");
  }

  if (body.type !== "text") {
    errors.push("type must be \"text\"");
  }

  if (!isNonEmptyString(body.name)) {
    errors.push("name is required");
  }

  if (!isNumber(body.startTime)) {
    errors.push("startTime must be a number");
  }

  if (!isNumber(body.duration)) {
    errors.push("duration must be a number");
  }

  if (!isNumber(body.x)) {
    errors.push("x must be a number");
  }

  if (!isNumber(body.y)) {
    errors.push("y must be a number");
  }

  if (!isNumber(body.width)) {
    errors.push("width must be a number");
  }

  if (!isNumber(body.height)) {
    errors.push("height must be a number");
  }

  if (!isNumber(body.rotation)) {
    errors.push("rotation must be a number");
  }

  if (!isNonEmptyString(body.text)) {
    errors.push("text is required");
  }

  if (!isNonEmptyString(body.fontFamily)) {
    errors.push("fontFamily is required");
  }

  if (!isNumber(body.fontSize)) {
    errors.push("fontSize must be a number");
  }

  if (!isNumber(body.fontWeight)) {
    errors.push("fontWeight must be a number");
  }

  if (!isNonEmptyString(body.textColor)) {
    errors.push("textColor is required");
  }

  if (!isNonEmptyString(body.backgroundColor)) {
    errors.push("backgroundColor is required");
  }

  if (!isNumber(body.lineHeight)) {
    errors.push("lineHeight must be a number");
  }

  if (!isNumber(body.letterSpacing)) {
    errors.push("letterSpacing must be a number");
  }

  if (!isNonEmptyString(body.textAlign)) {
    errors.push("textAlign is required");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (!isNonEmptyString(body.trackId)) {
  errors.push("trackId is required");
}

  const value: FrontendTextElementInput = {
    id: body.id as string,
    type: body.type as "text",
    name: body.name as string,
    startTime: body.startTime as number,
    duration: body.duration as number,
    x: body.x as number,
    y: body.y as number,
    width: body.width as number,
    height: body.height as number,
    rotation: body.rotation as number,
    text: body.text as string,
    fontFamily: body.fontFamily as string,
    fontSize: body.fontSize as number,
    fontWeight: body.fontWeight as number,
    textColor: body.textColor as string,
    backgroundColor: body.backgroundColor as string,
    lineHeight: body.lineHeight as number,
    letterSpacing: body.letterSpacing as number,
    textAlign: body.textAlign as string,
    trackId: body.trackId as string,
  };

  return { ok: true, value };
}
