import { Response } from "express";

export function sendSuccess(res: Response, data: unknown, status = 200) {
  return res.status(status).json({
    data,
    meta: {
      requestId: generateRequestId(),
      timestamp: new Date().toISOString()
    }
  });
}

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}