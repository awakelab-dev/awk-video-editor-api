import { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/HttpError";
import { projectExists } from "../services/projectService";
import {
  createElementFromFrontend,
  getTextElementsByProjectId
} from "../services/textElementService";
import { validateFrontendElementInput } from "../validation/textElementValidation";
import { createRequestId, successResponse } from "../utils/response";

const getRequestId = (res: Response): string => {
  const requestId = res.locals.requestId;
  return typeof requestId === "string" ? requestId : createRequestId();
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readTrackId = (value: unknown): string | null => {
  if (isNonEmptyString(value)) {
    return value;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    if (isNonEmptyString(item)) {
      return item;
    }
  }

  return null;
};

const getTrackId = (req: Request): string | null => {
  const trackIdFromQuery = readTrackId(req.query.trackId);
  if (trackIdFromQuery) {
    return trackIdFromQuery;
  }

  if (isRecord(req.body) && isNonEmptyString(req.body.trackId)) {
    return req.body.trackId;
  }

  return null;
};

export async function createTextElementHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projectId = req.params.projectId;

    if (!projectId) {
      throw new HttpError(400, "VALIDATION_ERROR", "projectId is required", [
        "projectId is required"
      ]);
    }

    const validation = validateFrontendElementInput(req.body);
    if (!validation.ok) {
      throw new HttpError(400, "VALIDATION_ERROR", "Validation error", validation.errors);
    }

    const trackId = getTrackId(req);
    if (!trackId) {
      throw new HttpError(400, "VALIDATION_ERROR", "Validation error", [
        "trackId is required"
      ]);
    }

    const exists = await projectExists(projectId);
    if (!exists) {
      throw new HttpError(404, "NOT_FOUND", "Project not found", []);
    }

    const element = await createElementFromFrontend(projectId, validation.value, trackId);

    const requestId = getRequestId(res);
    res.status(201).json(successResponse(element, requestId));
  } catch (error) {
    next(error);
  }
}

export async function getTextElementsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      throw new HttpError(400, "VALIDATION_ERROR", "projectId is required", [
        "projectId is required"
      ]);
    }

    const exists = await projectExists(projectId);
    if (!exists) {
      throw new HttpError(404, "NOT_FOUND", "Project not found", []);
    }

    const elements = await getTextElementsByProjectId(projectId);
    const requestId = getRequestId(res);
    res.status(200).json(successResponse(elements, requestId));
  } catch (error) {
    next(error);
  }
}
