import {
  AnyElement,
  AudioElement,
  BaseElement,
  ElementType,
  FrontendElementInput,
  ImageElement,
  ShapeElement,
  TextElement,
  VideoElement
} from "../types/element";

const elementTypes: readonly ElementType[] = [
  "text",
  "video",
  "image",
  "audio",
  "shape"
];

const baseKeys = [
  "id",
  "type",
  "name",
  "startTime",
  "duration",
  "opacity"
] as const;

const legacyCompatibleKeys = ["trackId"] as const;

const textKeys = [
  ...baseKeys,
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
  ...legacyCompatibleKeys
] as const;

const videoKeys = [
  ...baseKeys,
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "source",
  "trimStart",
  "trimEnd",
  "playbackRate",
  "volume",
  "muted",
  ...legacyCompatibleKeys
] as const;

const imageKeys = [
  ...baseKeys,
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "source",
  "fit",
  ...legacyCompatibleKeys
] as const;

const audioKeys = [
  ...baseKeys,
  "source",
  "playbackRate",
  "volume",
  "muted",
  "fadeIn",
  "fadeOut",
  ...legacyCompatibleKeys
] as const;

const shapeKeys = [
  ...baseKeys,
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "shapeType",
  "fillColor",
  "strokeColor",
  "strokeWidth",
  "cornerRadius",
  ...legacyCompatibleKeys
] as const;

const allowedKeysByType: Record<ElementType, readonly string[]> = {
  text: textKeys,
  video: videoKeys,
  image: imageKeys,
  audio: audioKeys,
  shape: shapeKeys
};

const allKnownKeys = Array.from(
  new Set([
    ...textKeys,
    ...videoKeys,
    ...imageKeys,
    ...audioKeys,
    ...shapeKeys
  ])
);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isBoolean = (value: unknown): value is boolean => {
  return typeof value === "boolean";
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const isElementType = (value: unknown): value is ElementType => {
  return typeof value === "string" && elementTypes.includes(value as ElementType);
};

const getUnknownKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): string[] => {
  return Object.keys(value).filter((key) => !allowedKeys.includes(key));
};

const validateBaseFields = (
  body: Record<string, unknown>,
  errors: string[]
): void => {
  if (body.id !== undefined && !isNonEmptyString(body.id)) {
    errors.push("id must be a non-empty string when provided");
  }

  if (!isElementType(body.type)) {
    errors.push(`type must be one of: ${elementTypes.join(", ")}`);
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

  if (body.opacity !== undefined && !isNumber(body.opacity)) {
    errors.push("opacity must be a number");
  }
};

const validateFramedFields = (
  body: Record<string, unknown>,
  errors: string[]
): void => {
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
};

const validatePositionFields = (
  body: Record<string, unknown>,
  errors: string[]
): void => {
  if (!isNumber(body.x)) {
    errors.push("x must be a number");
  }

  if (!isNumber(body.y)) {
    errors.push("y must be a number");
  }
};

const buildBaseElement = <TType extends ElementType>(
  body: Record<string, unknown>,
  type: TType
): BaseElement & { type: TType } => {
  const element: BaseElement & { type: TType } = {
    type,
    name: body.name as string,
    startTime: body.startTime as number,
    duration: body.duration as number,
    opacity: (body.opacity as number | undefined) ?? 100
  };

  if (isNonEmptyString(body.id)) {
    element.id = body.id;
  }

  return element;
};

const buildTextElement = (body: Record<string, unknown>): TextElement => {
  return {
    ...buildBaseElement(body, "text"),
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
    textAlign: body.textAlign as string
  };
};

const buildVideoElement = (body: Record<string, unknown>): VideoElement => {
  return {
    ...buildBaseElement(body, "video"),
    x: body.x as number,
    y: body.y as number,
    width: body.width as number,
    height: body.height as number,
    rotation: body.rotation as number,
    source: body.source as string,
    trimStart: body.trimStart as number,
    trimEnd: body.trimEnd as number,
    playbackRate: body.playbackRate as number,
    volume: body.volume as number,
    muted: body.muted as boolean
  };
};

const buildImageElement = (body: Record<string, unknown>): ImageElement => {
  return {
    ...buildBaseElement(body, "image"),
    x: body.x as number,
    y: body.y as number,
    width: body.width as number,
    height: body.height as number,
    rotation: body.rotation as number,
    source: body.source as string,
    fit: body.fit as string
  };
};

const buildAudioElement = (body: Record<string, unknown>): AudioElement => {
  return {
    ...buildBaseElement(body, "audio"),
    source: body.source as string,
    playbackRate: body.playbackRate as number,
    volume: body.volume as number,
    muted: body.muted as boolean,
    fadeIn: body.fadeIn as number,
    fadeOut: body.fadeOut as number
  };
};

const buildShapeElement = (body: Record<string, unknown>): ShapeElement => {
  return {
    ...body,
    ...buildBaseElement(body, "shape"),
    x: body.x as number,
    y: body.y as number,
    width: body.width as number,
    height: body.height as number,
    rotation: body.rotation as number,
    shapeType: body.shapeType as ShapeElement["shapeType"],
    fillColor: body.fillColor as string,
    strokeColor: body.strokeColor as string,
    strokeWidth: body.strokeWidth as number,
    cornerRadius: body.cornerRadius as number
  };
};

export type ValidationResult =
  | { ok: true; value: AnyElement }
  | { ok: false; errors: string[] };

export function validateFrontendElementInput(body: unknown): ValidationResult {
  if (!isRecord(body)) {
    return { ok: false, errors: ["Body must be an object"] };
  }

  const errors: string[] = [];
  const allowedKeys = isElementType(body.type)
    ? allowedKeysByType[body.type]
    : allKnownKeys;
  const unknownKeys = body.type === "shape" ? [] : getUnknownKeys(body, allowedKeys);

  if (unknownKeys.length > 0) {
    errors.push(`Unknown field(s): ${unknownKeys.join(", ")}`);
  }

  validateBaseFields(body, errors);

  if (!isElementType(body.type)) {
    return { ok: false, errors };
  }

  switch (body.type) {
    case "text":
      validateFramedFields(body, errors);

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
      break;

    case "video":
      validateFramedFields(body, errors);

      if (!isNonEmptyString(body.source)) {
        errors.push("source is required");
      }

      if (!isNumber(body.trimStart)) {
        errors.push("trimStart must be a number");
      }

      if (!isNumber(body.trimEnd)) {
        errors.push("trimEnd must be a number");
      }

      if (!isNumber(body.playbackRate)) {
        errors.push("playbackRate must be a number");
      }

      if (!isNumber(body.volume)) {
        errors.push("volume must be a number");
      }

      if (!isBoolean(body.muted)) {
        errors.push("muted must be a boolean");
      }
      break;

    case "image":
      validateFramedFields(body, errors);

      if (!isNonEmptyString(body.source)) {
        errors.push("source is required");
      }

      if (!isNonEmptyString(body.fit)) {
        errors.push("fit is required");
      }
      break;

    case "audio":
      if (!isNonEmptyString(body.source)) {
        errors.push("source is required");
      }

      if (!isNumber(body.playbackRate)) {
        errors.push("playbackRate must be a number");
      }

      if (!isNumber(body.volume)) {
        errors.push("volume must be a number");
      }

      if (!isBoolean(body.muted)) {
        errors.push("muted must be a boolean");
      }

      if (!isNumber(body.fadeIn)) {
        errors.push("fadeIn must be a number");
      }

      if (!isNumber(body.fadeOut)) {
        errors.push("fadeOut must be a number");
      }
      break;

    case "shape":
      validateFramedFields(body, errors);

      if (!isNonEmptyString(body.shapeType)) {
        errors.push("shapeType is required");
      }

      if (!isNonEmptyString(body.fillColor)) {
        errors.push("fillColor is required");
      }

      if (!isNonEmptyString(body.strokeColor)) {
        errors.push("strokeColor is required");
      }

      if (!isNumber(body.strokeWidth)) {
        errors.push("strokeWidth must be a number");
      }

      if (!isNumber(body.cornerRadius)) {
        errors.push("cornerRadius must be a number");
      }
      break;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  let value: AnyElement;

  switch (body.type) {
    case "text":
      value = buildTextElement(body);
      break;
    case "video":
      value = buildVideoElement(body);
      break;
    case "image":
      value = buildImageElement(body);
      break;
    case "audio":
      value = buildAudioElement(body);
      break;
    case "shape":
      value = buildShapeElement(body);
      break;
  }

  return { ok: true, value };
}

export type LegacyTextValidationResult =
  | { ok: true; value: FrontendElementInput }
  | { ok: false; errors: string[] };
