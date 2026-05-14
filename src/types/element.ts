import { ObjectId } from "mongodb";

export type ElementType = "text" | "video" | "image" | "audio" | "shape";

export interface BaseElement {
  id?: string;
  type: ElementType;
  name: string;
  startTime: number;
  duration: number;
  opacity: number;
}

export interface PositionedElement extends BaseElement {
  x: number;
  y: number;
}

export interface FramedElement extends PositionedElement {
  width: number;
  height: number;
  rotation: number;
}

export interface TextElement extends FramedElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  lineHeight: number;
  letterSpacing: number;
  textAlign: string;
}

export interface VideoElement extends FramedElement {
  type: "video";
  source: string;
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
}

export interface ImageElement extends FramedElement {
  type: "image";
  source: string;
  fit: string;
}

export interface AudioElement extends BaseElement {
  type: "audio";
  source: string;
  playbackRate: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface ShapeElement extends FramedElement {
  type: "shape";
  shapeType: "rectangle" | "ellipse" | "line" | "triangle" | "polygon";
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
}

export type AnyElement =
  | TextElement
  | VideoElement
  | ImageElement
  | AudioElement
  | ShapeElement;

export type FrontendElementInput = AnyElement;

export interface TextElementPosition {
  x: number;
  y: number;
}

export interface TextElementTiming {
  start: number;
  end: number;
}

export interface LegacyTextElementInput {
  type: "text";
  content: string;
  position: TextElementPosition;
  timing: TextElementTiming;
  trackId: string;
}

export interface LegacyTextElementDoc extends LegacyTextElementInput {
  _id: ObjectId;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersistedElementDoc {
  _id: ObjectId;
  projectId: string;
  trackId: string;
  type: ElementType;
  data: AnyElement;
  createdAt: Date;
  updatedAt: Date;
}

export type ElementDoc = PersistedElementDoc | LegacyTextElementDoc;
export type TextElementInput = LegacyTextElementInput;
export type TextElementDoc = ElementDoc;

export interface TextElementResponse extends LegacyTextElementInput {
  _id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export type GenericElementResponse = AnyElement & {
  _id: string;
  projectId: string;
  trackId: string;
  createdAt: string;
  updatedAt: string;
};

export type ElementResponse = TextElementResponse | GenericElementResponse;
