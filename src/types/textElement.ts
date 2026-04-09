import { ObjectId } from "mongodb";

export interface FrontendTextElementInput {
  id: string;
  type: "text";
  name: string;
  startTime: number;
  duration: number;
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
  textAlign: string;
  trackId: string;
}

export interface TextElementPosition {
  x: number;
  y: number;
}

export interface TextElementTiming {
  start: number;
  end: number;
}

export interface TextElementInput {
  type: "text";
  content: string;
  position: TextElementPosition;
  timing: TextElementTiming;
  trackId: string;
}

export interface TextElementDoc extends TextElementInput {
  _id: ObjectId;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TextElementResponse extends TextElementInput {
  _id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}
