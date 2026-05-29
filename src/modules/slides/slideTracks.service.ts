import OpenAI from "openai";
import {
  AiSlideOutput,
  CreateSlideTracksInput,
  aiSlideSchema,
} from "./slideTracks.schemas";
import type { SummaryResponse } from "../../types/summary";

const SLIDE_DURATION_SECONDS = 12;
const RESOLUTION = { w: 1024, h: 576 };
const TEXT_TRACK_ID = "track_text";
const AUDIO_TRACK_ID = "track_audio";
const MEDIA_TRACK_ID = "track_media";

const SLOT_LIMITS = {
  title: { fontSize: 46, maxChars: 58 },
  subtitle: { fontSize: 24, maxChars: 140 },
  body: { fontSize: 18, maxChars: 320 },
  bullet: { fontSize: 14, maxChars: 72 },
  takeaway: { fontSize: 20, maxChars: 140 },
  sourceNote: { fontSize: 13, maxChars: 90 },
} as const;

type SlideCopy = AiSlideOutput["slides"][number];

type TextElement = {
  id: string;
  type: "text";
  name: string;
  startTime: number;
  duration: number;
  opacity: number;
  effects: unknown[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right" | "justify";
};

type ShapeElement = {
  id: string;
  type: "shape";
  name: string;
  startTime: number;
  duration: number;
  opacity: number;
  effects: unknown[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shapeType: "rectangle";
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
};

type Track = {
  id: string;
  name: string;
  kind: "text" | "audio" | "media";
  elements: Array<TextElement | ShapeElement>;
};

type SlideLayout =
  | "cover"
  | "objective"
  | "concept"
  | "comparison"
  | "flow"
  | "example"
  | "recap"
  | "closing";

type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutStyle = LayoutBox & {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right" | "justify";
};

type SlideLayoutConfig = {
  title: LayoutStyle;
  subtitle: LayoutStyle;
  section: LayoutStyle;
  body: LayoutStyle;
  bullets: LayoutStyle;
  takeaway: LayoutStyle;
  sourceNote: LayoutStyle;
  sectionCard: LayoutBox & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  bulletCard: LayoutBox & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  takeawayCard: LayoutBox & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  sourceCard: LayoutBox & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  backgroundFill: string;
  backgroundStroke: string;
  decorLeft: LayoutBox & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  decorRight: LayoutBox & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  decorBottom: LayoutBox & {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
  };
};

type SlideLayoutOverrides = {
  [K in keyof SlideLayoutConfig]?: Partial<SlideLayoutConfig[K]>;
};

export class SlideGenerationError extends Error {}

function fitToMaxChars(raw: string, maxChars: number): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;

  const candidate = normalized.slice(0, maxChars + 1);
  const cutAt = candidate.lastIndexOf(" ");
  if (cutAt <= 0) return normalized.slice(0, maxChars).trim();
  return candidate.slice(0, cutAt).trim();
}

function wrapText(raw: string, lineMaxChars: number, maxLines: number): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const words = normalized.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= lineMaxChars) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
      if (lines.length >= maxLines) break;
    }

    if (word.length > lineMaxChars) {
      lines.push(word.slice(0, lineMaxChars));
      if (lines.length >= maxLines) break;
    } else {
      currentLine = word;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines).join("\n");
}

function buildTextElement(
  slideIndex: number,
  key: string,
  partial: Omit<
    TextElement,
    | "id"
    | "startTime"
    | "duration"
    | "type"
    | "opacity"
    | "effects"
    | "rotation"
  >,
): TextElement {
  return {
    id: `sql-ai-s${slideIndex + 1}-${key}`,
    type: "text",
    startTime: slideIndex * SLIDE_DURATION_SECONDS,
    duration: SLIDE_DURATION_SECONDS,
    opacity: 1,
    effects: [],
    rotation: 0,
    ...partial,
  };
}

function buildShapeElement(
  slideIndex: number,
  key: string,
  partial: Omit<
    ShapeElement,
    | "id"
    | "startTime"
    | "duration"
    | "type"
    | "opacity"
    | "effects"
    | "rotation"
    | "shapeType"
  >,
): ShapeElement {
  return {
    id: `sql-ai-s${slideIndex + 1}-${key}`,
    type: "shape",
    startTime: slideIndex * SLIDE_DURATION_SECONDS,
    duration: SLIDE_DURATION_SECONDS,
    opacity: 1,
    effects: [],
    rotation: 0,
    shapeType: "rectangle",
    ...partial,
  };
}

function buildMediaBackground(slideIndex: number): ShapeElement {
  return {
    id: `sql-ai-bg-s${slideIndex + 1}`,
    type: "shape",
    name: `Fondo slide ${slideIndex + 1}`,
    startTime: slideIndex * SLIDE_DURATION_SECONDS,
    duration: SLIDE_DURATION_SECONDS,
    opacity: 1,
    effects: [],
    x: 0,
    y: 0,
    width: RESOLUTION.w,
    height: RESOLUTION.h,
    rotation: 0,
    shapeType: "rectangle",
    fillColor: "#fbfffe",
    strokeColor: "#b7f3ea",
    strokeWidth: 1,
    cornerRadius: 14,
  };
}

function buildDecorativeBackgroundShapes(slideIndex: number): ShapeElement[] {
  return [
    buildShapeElement(slideIndex, "decor-left", {
      name: `Decoracion izquierda slide ${slideIndex + 1}`,
      x: -130,
      y: 284,
      width: 320,
      height: 280,
      fillColor: "rgba(225, 247, 244, 0.78)",
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 999,
    }),
    buildShapeElement(slideIndex, "decor-right", {
      name: `Decoracion derecha slide ${slideIndex + 1}`,
      x: 824,
      y: 26,
      width: 210,
      height: 190,
      fillColor: "rgba(211, 246, 241, 0.64)",
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 999,
    }),
    buildShapeElement(slideIndex, "decor-bottom", {
      name: `Decoracion inferior slide ${slideIndex + 1}`,
      x: 470,
      y: 430,
      width: 170,
      height: 160,
      fillColor: "rgba(252, 244, 229, 0.82)",
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 999,
    }),
  ];
}

const BASE_LAYOUT_CONFIG: SlideLayoutConfig = {
  title: {
    x: 54,
    y: 58,
    width: 820,
    height: 58,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: SLOT_LIMITS.title.fontSize,
    fontWeight: 800,
    textColor: "#0f766e",
    backgroundColor: "transparent",
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: "left",
  },
  subtitle: {
    x: 54,
    y: 130,
    width: 820,
    height: 82,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: SLOT_LIMITS.subtitle.fontSize,
    fontWeight: 500,
    textColor: "#475569",
    backgroundColor: "transparent",
    lineHeight: 1.3,
    letterSpacing: 0,
    textAlign: "left",
  },
  section: {
    x: 54,
    y: 224,
    width: 250,
    height: 24,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: SLOT_LIMITS.bullet.fontSize,
    fontWeight: 700,
    textColor: "#0f766e",
    backgroundColor: "transparent",
    lineHeight: 1.2,
    letterSpacing: 1,
    textAlign: "left",
  },
  body: {
    x: 54,
    y: 258,
    width: 540,
    height: 185,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: SLOT_LIMITS.body.fontSize,
    fontWeight: 400,
    textColor: "#0f172a",
    backgroundColor: "transparent",
    lineHeight: 1.45,
    letterSpacing: 0,
    textAlign: "left",
  },
  bullets: {
    x: 54,
    y: 456,
    width: 540,
    height: 95,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: SLOT_LIMITS.bullet.fontSize,
    fontWeight: 600,
    textColor: "#0f766e",
    backgroundColor: "transparent",
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: "left",
  },
  takeaway: {
    x: 620,
    y: 258,
    width: 350,
    height: 120,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: SLOT_LIMITS.takeaway.fontSize,
    fontWeight: 700,
    textColor: "#0f766e",
    backgroundColor: "transparent",
    lineHeight: 1.35,
    letterSpacing: 0,
    textAlign: "left",
  },
  sourceNote: {
    x: 620,
    y: 398,
    width: 350,
    height: 120,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: SLOT_LIMITS.sourceNote.fontSize,
    fontWeight: 500,
    textColor: "#334155",
    backgroundColor: "transparent",
    lineHeight: 1.45,
    letterSpacing: 0,
    textAlign: "left",
  },
  sectionCard: {
    x: 44,
    y: 218,
    width: 226,
    height: 34,
    fillColor: "#ecfdfa",
    strokeColor: "#a7f3d0",
    strokeWidth: 1,
    cornerRadius: 8,
  },
  bulletCard: {
    x: 44,
    y: 446,
    width: 560,
    height: 112,
    fillColor: "rgba(255, 255, 255, 0.86)",
    strokeColor: "#b7f3ea",
    strokeWidth: 1,
    cornerRadius: 12,
  },
  takeawayCard: {
    x: 610,
    y: 246,
    width: 366,
    height: 142,
    fillColor: "#ecfdfa",
    strokeColor: "#99f6e4",
    strokeWidth: 1,
    cornerRadius: 12,
  },
  sourceCard: {
    x: 610,
    y: 388,
    width: 366,
    height: 142,
    fillColor: "#ffffff",
    strokeColor: "#cbd5e1",
    strokeWidth: 1,
    cornerRadius: 12,
  },
  backgroundFill: "#fbfffe",
  backgroundStroke: "#b7f3ea",
  decorLeft: {
    x: -130,
    y: 284,
    width: 320,
    height: 280,
    fillColor: "rgba(225, 247, 244, 0.78)",
    strokeColor: "transparent",
    strokeWidth: 0,
    cornerRadius: 999,
  },
  decorRight: {
    x: 824,
    y: 26,
    width: 210,
    height: 190,
    fillColor: "rgba(211, 246, 241, 0.64)",
    strokeColor: "transparent",
    strokeWidth: 0,
    cornerRadius: 999,
  },
  decorBottom: {
    x: 470,
    y: 430,
    width: 170,
    height: 160,
    fillColor: "rgba(252, 244, 229, 0.82)",
    strokeColor: "transparent",
    strokeWidth: 0,
    cornerRadius: 999,
  },
};

const LAYOUT_OVERRIDES: Record<SlideLayout, SlideLayoutOverrides> = {
  cover: {},
  objective: {
    title: { x: 54, y: 44, width: 670, height: 86, fontSize: 42 },
    subtitle: { x: 54, y: 138, width: 610, height: 78, fontSize: 22 },
    body: { x: 54, y: 236, width: 560, height: 168 },
    bullets: { x: 54, y: 420, width: 560, height: 118 },
    takeaway: { x: 656, y: 124, width: 300, height: 160, fontSize: 22 },
    sourceNote: { x: 656, y: 304, width: 300, height: 126 },
    sectionCard: { x: 44, y: 212, width: 232, height: 38 },
    bulletCard: { x: 44, y: 408, width: 570, height: 134 },
    takeawayCard: { x: 644, y: 108, width: 324, height: 176 },
    sourceCard: { x: 644, y: 292, width: 324, height: 144 },
  },
  concept: {
    title: { x: 54, y: 46, width: 720, height: 78, fontSize: 40 },
    subtitle: { x: 54, y: 128, width: 720, height: 74, fontSize: 22 },
    body: { x: 54, y: 214, width: 454, height: 236 },
    bullets: { x: 54, y: 466, width: 454, height: 84 },
    takeaway: {
      x: 540,
      y: 214,
      width: 410,
      height: 168,
      fontSize: 24,
      textAlign: "center",
    },
    sourceNote: {
      x: 540,
      y: 392,
      width: 410,
      height: 106,
      textAlign: "center",
    },
    sectionCard: { x: 44, y: 206, width: 210, height: 34 },
    bulletCard: { x: 44, y: 452, width: 470, height: 100 },
    takeawayCard: {
      x: 528,
      y: 202,
      width: 434,
      height: 186,
      fillColor: "#ecfeff",
      strokeColor: "#67e8f9",
    },
    sourceCard: { x: 528, y: 384, width: 434, height: 128 },
    decorLeft: { x: -120, y: 290, width: 300, height: 260 },
    decorRight: { x: 808, y: 24, width: 220, height: 200 },
  },
  comparison: {
    title: { x: 54, y: 42, width: 840, height: 62, fontSize: 38 },
    subtitle: { x: 54, y: 112, width: 840, height: 76, fontSize: 21 },
    body: { x: 54, y: 208, width: 400, height: 240 },
    bullets: { x: 470, y: 208, width: 480, height: 168 },
    takeaway: { x: 470, y: 390, width: 480, height: 90, fontSize: 22 },
    sourceNote: { x: 54, y: 464, width: 896, height: 80, textAlign: "center" },
    sectionCard: {
      x: 44,
      y: 200,
      width: 220,
      height: 34,
      fillColor: "#f0fdfa",
    },
    bulletCard: {
      x: 456,
      y: 196,
      width: 502,
      height: 188,
      fillColor: "#ffffff",
    },
    takeawayCard: {
      x: 456,
      y: 378,
      width: 502,
      height: 104,
      fillColor: "#ecfdf5",
    },
    sourceCard: { x: 44, y: 456, width: 914, height: 92, fillColor: "#f8fafc" },
    decorBottom: {
      x: 438,
      y: 430,
      width: 228,
      height: 146,
      fillColor: "rgba(236, 253, 245, 0.8)",
    },
  },
  flow: {
    title: { x: 54, y: 40, width: 760, height: 72, fontSize: 41 },
    subtitle: { x: 54, y: 120, width: 760, height: 62, fontSize: 21 },
    body: { x: 54, y: 206, width: 360, height: 250 },
    bullets: {
      x: 54,
      y: 470,
      width: 860,
      height: 74,
      fontSize: 15,
      lineHeight: 1.45,
    },
    takeaway: { x: 442, y: 206, width: 514, height: 140, fontSize: 22 },
    sourceNote: { x: 442, y: 356, width: 514, height: 126 },
    sectionCard: { x: 44, y: 198, width: 210, height: 34 },
    bulletCard: { x: 44, y: 456, width: 882, height: 90, fillColor: "#ecfdfa" },
    takeawayCard: {
      x: 428,
      y: 194,
      width: 538,
      height: 154,
      fillColor: "#eff6ff",
      strokeColor: "#bfdbfe",
    },
    sourceCard: { x: 428, y: 346, width: 538, height: 148 },
    decorLeft: {
      x: -140,
      y: 274,
      width: 340,
      height: 300,
      fillColor: "rgba(219, 234, 254, 0.75)",
    },
    decorRight: {
      x: 816,
      y: 18,
      width: 222,
      height: 196,
      fillColor: "rgba(224, 231, 255, 0.6)",
    },
  },
  example: {
    title: { x: 54, y: 46, width: 700, height: 70, fontSize: 40 },
    subtitle: { x: 54, y: 122, width: 700, height: 72, fontSize: 22 },
    body: { x: 54, y: 210, width: 510, height: 190 },
    bullets: { x: 54, y: 414, width: 510, height: 116 },
    takeaway: { x: 592, y: 210, width: 368, height: 176, fontSize: 24 },
    sourceNote: { x: 592, y: 402, width: 368, height: 114 },
    sectionCard: {
      x: 44,
      y: 202,
      width: 214,
      height: 34,
      fillColor: "#fefce8",
      strokeColor: "#fde68a",
    },
    bulletCard: {
      x: 44,
      y: 402,
      width: 530,
      height: 136,
      fillColor: "#fffbeb",
    },
    takeawayCard: {
      x: 580,
      y: 198,
      width: 390,
      height: 190,
      fillColor: "#fff7ed",
      strokeColor: "#fdba74",
    },
    sourceCard: {
      x: 580,
      y: 390,
      width: 390,
      height: 126,
      fillColor: "#ffffff",
      strokeColor: "#fed7aa",
    },
    decorLeft: {
      x: -100,
      y: 300,
      width: 300,
      height: 240,
      fillColor: "rgba(254, 243, 199, 0.66)",
    },
    decorRight: {
      x: 830,
      y: 28,
      width: 210,
      height: 188,
      fillColor: "rgba(253, 230, 138, 0.42)",
    },
    decorBottom: {
      x: 462,
      y: 426,
      width: 188,
      height: 168,
      fillColor: "rgba(255, 247, 237, 0.78)",
    },
  },
  recap: {
    title: { x: 54, y: 44, width: 760, height: 74, fontSize: 39 },
    subtitle: { x: 54, y: 120, width: 760, height: 68, fontSize: 21 },
    body: { x: 54, y: 208, width: 840, height: 114 },
    bullets: { x: 54, y: 340, width: 840, height: 132 },
    takeaway: { x: 54, y: 490, width: 498, height: 56, fontSize: 21 },
    sourceNote: { x: 572, y: 490, width: 322, height: 56, fontSize: 12 },
    sectionCard: { x: 44, y: 200, width: 220, height: 34 },
    bulletCard: {
      x: 44,
      y: 332,
      width: 882,
      height: 144,
      fillColor: "#f8fafc",
    },
    takeawayCard: {
      x: 44,
      y: 480,
      width: 500,
      height: 74,
      fillColor: "#ecfdf5",
    },
    sourceCard: {
      x: 560,
      y: 480,
      width: 366,
      height: 74,
      fillColor: "#ffffff",
    },
    decorLeft: {
      x: -128,
      y: 280,
      width: 320,
      height: 280,
      fillColor: "rgba(236, 253, 245, 0.7)",
    },
    decorRight: {
      x: 824,
      y: 24,
      width: 214,
      height: 188,
      fillColor: "rgba(207, 250, 254, 0.48)",
    },
  },
  closing: {
    title: { x: 54, y: 52, width: 780, height: 84, fontSize: 44 },
    subtitle: { x: 54, y: 142, width: 780, height: 68, fontSize: 22 },
    body: { x: 54, y: 236, width: 500, height: 160 },
    bullets: { x: 54, y: 414, width: 500, height: 100 },
    takeaway: {
      x: 584,
      y: 220,
      width: 360,
      height: 140,
      fontSize: 24,
      textAlign: "center",
    },
    sourceNote: {
      x: 584,
      y: 378,
      width: 360,
      height: 120,
      textAlign: "center",
    },
    sectionCard: {
      x: 44,
      y: 228,
      width: 210,
      height: 34,
      fillColor: "#ecfeff",
      strokeColor: "#a5f3fc",
    },
    bulletCard: {
      x: 44,
      y: 402,
      width: 530,
      height: 122,
      fillColor: "#ffffff",
    },
    takeawayCard: {
      x: 570,
      y: 208,
      width: 380,
      height: 160,
      fillColor: "#ecfeff",
      strokeColor: "#67e8f9",
    },
    sourceCard: {
      x: 570,
      y: 368,
      width: 380,
      height: 138,
      fillColor: "#f8fafc",
    },
    decorLeft: {
      x: -136,
      y: 286,
      width: 330,
      height: 290,
      fillColor: "rgba(224, 251, 252, 0.7)",
    },
    decorRight: {
      x: 824,
      y: 30,
      width: 220,
      height: 190,
      fillColor: "rgba(255, 247, 237, 0.56)",
    },
  },
};

function resolveLayoutConfig(layout: SlideLayout): SlideLayoutConfig {
  const override = LAYOUT_OVERRIDES[layout];
  return {
    title: { ...BASE_LAYOUT_CONFIG.title, ...override.title },
    subtitle: { ...BASE_LAYOUT_CONFIG.subtitle, ...override.subtitle },
    section: { ...BASE_LAYOUT_CONFIG.section, ...override.section },
    body: { ...BASE_LAYOUT_CONFIG.body, ...override.body },
    bullets: { ...BASE_LAYOUT_CONFIG.bullets, ...override.bullets },
    takeaway: { ...BASE_LAYOUT_CONFIG.takeaway, ...override.takeaway },
    sourceNote: { ...BASE_LAYOUT_CONFIG.sourceNote, ...override.sourceNote },
    sectionCard: { ...BASE_LAYOUT_CONFIG.sectionCard, ...override.sectionCard },
    bulletCard: { ...BASE_LAYOUT_CONFIG.bulletCard, ...override.bulletCard },
    takeawayCard: {
      ...BASE_LAYOUT_CONFIG.takeawayCard,
      ...override.takeawayCard,
    },
    sourceCard: { ...BASE_LAYOUT_CONFIG.sourceCard, ...override.sourceCard },
    backgroundFill:
      override.backgroundFill ?? BASE_LAYOUT_CONFIG.backgroundFill,
    backgroundStroke:
      override.backgroundStroke ?? BASE_LAYOUT_CONFIG.backgroundStroke,
    decorLeft: { ...BASE_LAYOUT_CONFIG.decorLeft, ...override.decorLeft },
    decorRight: { ...BASE_LAYOUT_CONFIG.decorRight, ...override.decorRight },
    decorBottom: { ...BASE_LAYOUT_CONFIG.decorBottom, ...override.decorBottom },
  };
}

function inferSlideLayout(
  slide: SlideCopy,
  slideIndex: number,
  totalSlides: number,
): SlideLayout {
  if (slide.layout) {
    return slide.layout;
  }

  if (slideIndex === 0) return "cover";
  if (slideIndex === totalSlides - 1) return "closing";

  const searchableText = [
    slide.title,
    slide.subtitle,
    slide.body,
    slide.takeaway,
    slide.sourceNote,
    ...slide.bullets,
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(ejemplo|example|caso)\b/.test(searchableText)) return "example";
  if (/\b(flujo|paso|proceso|secuencia)\b/.test(searchableText)) return "flow";
  if (/\b(objetivo|meta|goal|learning)\b/.test(searchableText))
    return "objective";
  if (/\b(compar|vs|diferenc|contraste|relacion)\b/.test(searchableText))
    return "comparison";
  if (/\b(recap|resumen|conclusion|cerramos|repaso)\b/.test(searchableText))
    return "recap";
  if (/\b(concepto|principio|idea|clave)\b/.test(searchableText))
    return "concept";

  const palette: SlideLayout[] = [
    "objective",
    "concept",
    "comparison",
    "flow",
    "example",
    "recap",
  ];
  return palette[(slideIndex - 1) % palette.length];
}

function normalizeSlideCopy(slide: SlideCopy): SlideCopy {
  return {
    layout: slide.layout,
    title: fitToMaxChars(slide.title, SLOT_LIMITS.title.maxChars),
    subtitle: fitToMaxChars(slide.subtitle, SLOT_LIMITS.subtitle.maxChars),
    body: fitToMaxChars(slide.body, SLOT_LIMITS.body.maxChars),
    bullets: slide.bullets
      .map((bullet) => fitToMaxChars(bullet, SLOT_LIMITS.bullet.maxChars))
      .slice(0, 3),
    takeaway: fitToMaxChars(slide.takeaway, SLOT_LIMITS.takeaway.maxChars),
    sourceNote: fitToMaxChars(
      slide.sourceNote,
      SLOT_LIMITS.sourceNote.maxChars,
    ),
  };
}

function buildTracks(slides: SlideCopy[]): Track[] {
  const textElements: TextElement[] = [];
  const mediaElements: ShapeElement[] = [];

  slides.forEach((rawSlide, slideIndex) => {
    const slide = normalizeSlideCopy(rawSlide);
    const layout = resolveLayoutConfig(
      inferSlideLayout(slide, slideIndex, slides.length),
    );
    const sectionLabel = `SECCION ${String(slideIndex + 1).padStart(2, "0")}`;
    const wrappedTitle = wrapText(slide.title, 28, 2);
    const wrappedSubtitle = wrapText(slide.subtitle, 54, 3);
    const wrappedBody = wrapText(slide.body, 58, 7);
    const wrappedTakeaway = wrapText(slide.takeaway, 36, 4);
    const wrappedSourceNote = wrapText(slide.sourceNote, 40, 5);
    const bulletLines = slide.bullets
      .map((item) => `• ${wrapText(item, 48, 2)}`)
      .join("\n");

    textElements.push(
      buildTextElement(slideIndex, "title", {
        name: `Titulo slide ${slideIndex + 1}`,
        text: wrappedTitle,
        ...layout.title,
      }),
      buildTextElement(slideIndex, "subtitle", {
        name: `Subtitulo slide ${slideIndex + 1}`,
        text: wrappedSubtitle,
        ...layout.subtitle,
      }),
      buildTextElement(slideIndex, "section", {
        name: `Etiqueta slide ${slideIndex + 1}`,
        text: sectionLabel,
        ...layout.section,
      }),
      buildTextElement(slideIndex, "body", {
        name: `Desarrollo slide ${slideIndex + 1}`,
        text: wrappedBody,
        ...layout.body,
      }),
      buildTextElement(slideIndex, "bullets", {
        name: `Puntos clave slide ${slideIndex + 1}`,
        text: bulletLines,
        ...layout.bullets,
      }),
      buildTextElement(slideIndex, "takeaway", {
        name: `Takeaway slide ${slideIndex + 1}`,
        text: wrappedTakeaway,
        ...layout.takeaway,
      }),
      buildTextElement(slideIndex, "source-note", {
        name: `Nota fuente slide ${slideIndex + 1}`,
        text: wrappedSourceNote,
        ...layout.sourceNote,
      }),
    );

    mediaElements.push(
      buildMediaBackground(slideIndex),
      buildShapeElement(slideIndex, "decor-left", {
        name: `Decoracion izquierda slide ${slideIndex + 1}`,
        ...layout.decorLeft,
      }),
      buildShapeElement(slideIndex, "decor-right", {
        name: `Decoracion derecha slide ${slideIndex + 1}`,
        ...layout.decorRight,
      }),
      buildShapeElement(slideIndex, "decor-bottom", {
        name: `Decoracion inferior slide ${slideIndex + 1}`,
        ...layout.decorBottom,
      }),
      buildShapeElement(slideIndex, "section-card", {
        name: `Card seccion slide ${slideIndex + 1}`,
        ...layout.sectionCard,
      }),
      buildShapeElement(slideIndex, "bullet-card", {
        name: `Card bullets slide ${slideIndex + 1}`,
        ...layout.bulletCard,
      }),
      buildShapeElement(slideIndex, "takeaway-card", {
        name: `Card takeaway slide ${slideIndex + 1}`,
        ...layout.takeawayCard,
      }),
      buildShapeElement(slideIndex, "source-card", {
        name: `Card fuente slide ${slideIndex + 1}`,
        ...layout.sourceCard,
      }),
    );
  });

  return [
    {
      id: TEXT_TRACK_ID,
      name: "Text Track",
      kind: "text",
      elements: textElements,
    },
    {
      id: AUDIO_TRACK_ID,
      name: "Audio Track",
      kind: "audio",
      elements: [],
    },
    {
      id: MEDIA_TRACK_ID,
      name: "Media Track",
      kind: "media",
      elements: mediaElements,
    },
  ];
}

function summaryToSlideCopies(summary: SummaryResponse): SlideCopy[] {
  return summary.slides.map((slide, slideIndex) => ({
    layout: pickLayoutFromSummarySlide(
      slide,
      slideIndex,
      summary.slides.length,
      summary.title,
    ),
    title: slide.title,
    subtitle: slide.keywords.slice(0, 3).join(" · ") || summary.title,
    body: slide.summary,
    bullets: slide.bullets.length > 0 ? slide.bullets : [slide.summary],
    takeaway: slide.speakerNotes || slide.summary,
    sourceNote:
      slide.keywords.length > 0
        ? `Keywords: ${slide.keywords.slice(0, 6).join(", ")}`
        : `Resumen derivado de ${summary.title}`,
  }));
}

function pickLayoutFromSummarySlide(
  slide: SummaryResponse["slides"][number],
  slideIndex: number,
  totalSlides: number,
  summaryTitle: string,
): SlideLayout {
  const searchableText = [
    slide.title,
    slide.summary,
    slide.speakerNotes,
    slide.keywords.join(" "),
    summaryTitle,
  ]
    .join(" ")
    .toLowerCase();

  if (slideIndex === 0) return "cover";
  if (slideIndex === totalSlides - 1) return "closing";
  if (/\b(ejemplo|caso)\b/.test(searchableText)) return "example";
  if (/\b(flujo|paso|proceso|secuencia)\b/.test(searchableText)) return "flow";
  if (/\b(objetivo|meta)\b/.test(searchableText)) return "objective";
  if (/\b(compar|vs|contraste|diferenc)\b/.test(searchableText))
    return "comparison";
  if (/\b(recap|resumen|conclusion|cierre|repaso)\b/.test(searchableText))
    return "recap";
  if (/\b(concepto|principio|idea|clave)\b/.test(searchableText))
    return "concept";

  const fallback: SlideLayout[] = [
    "objective",
    "concept",
    "comparison",
    "flow",
    "example",
    "recap",
  ];
  return fallback[(slideIndex - 1) % fallback.length] ?? "concept";
}

function buildPrompt(
  input: CreateSlideTracksInput,
  targetSlides: number,
): string {
  const languageLabel = input.language === "en" ? "English" : "Spanish";
  return [
    `You are a presentation summarizer. Output language: ${languageLabel}.`,
    `Create exactly ${targetSlides} slides from the source text.`,
    "Each slide must be concise and fit strict text limits inspired by the provided visual template.",
    'Return only valid JSON with shape: {"slides":[{"layout":"cover|objective|concept|comparison|flow|example|recap|closing","title":"","subtitle":"","body":"","bullets":["","",""],"takeaway":"","sourceNote":""}]}',
    `Limits per field: title<=${SLOT_LIMITS.title.maxChars}, subtitle<=${SLOT_LIMITS.subtitle.maxChars}, body<=${SLOT_LIMITS.body.maxChars}, each bullet<=${SLOT_LIMITS.bullet.maxChars}, takeaway<=${SLOT_LIMITS.takeaway.maxChars}, sourceNote<=${SLOT_LIMITS.sourceNote.maxChars}.`,
    "Do not use markdown. Do not add extra keys.",
  ].join("\n");
}

function targetSlideCount(text: string, maxSlides: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const guessed = Math.ceil(words / 170);
  return Math.max(3, Math.min(maxSlides, guessed));
}

function ensureOpenAiKey(): string {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new SlideGenerationError("OPENAI_API_KEY is required");
  }
  return apiKey;
}

export async function summarizeTextToSlides(
  input: CreateSlideTracksInput,
): Promise<SlideCopy[]> {
  const openai = new OpenAI({
    apiKey: ensureOpenAiKey(),
  });
  const slidesToGenerate = targetSlideCount(input.text, input.maxSlides);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildPrompt(input, slidesToGenerate) },
      { role: "user", content: input.text.slice(0, 30000) },
    ],
  });

  const rawContent = completion.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new SlideGenerationError("OpenAI returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (_error) {
    throw new SlideGenerationError("OpenAI response was not valid JSON");
  }

  const validated = aiSlideSchema.safeParse(parsed);
  if (!validated.success) {
    throw new SlideGenerationError(
      "OpenAI response does not match the expected slide schema",
    );
  }

  return validated.data.slides.slice(0, input.maxSlides);
}

export async function generateSlideTracks(
  input: CreateSlideTracksInput,
  summarize: (
    payload: CreateSlideTracksInput,
  ) => Promise<SlideCopy[]> = summarizeTextToSlides,
): Promise<{
  tracks: Track[];
  slides: number;
  durationSeconds: number;
  resolution: { w: number; h: number };
}> {
  const slides = await summarize(input);
  const tracks = buildTracks(slides);

  return {
    tracks,
    slides: slides.length,
    durationSeconds: slides.length * SLIDE_DURATION_SECONDS,
    resolution: RESOLUTION,
  };
}

export async function generateSlideTracksFromSummary(
  summary: SummaryResponse,
): Promise<{
  tracks: Track[];
  slides: number;
  durationSeconds: number;
  resolution: { w: number; h: number };
}> {
  const tracks = buildTracks(summaryToSlideCopies(summary));

  return {
    tracks,
    slides: summary.slides.length,
    durationSeconds: summary.slides.length * SLIDE_DURATION_SECONDS,
    resolution: RESOLUTION,
  };
}
