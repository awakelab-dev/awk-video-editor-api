import { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/HttpError";
import { projectExists } from "../services/projectService";
import {
  createTextElementFromFrontend,
  getTextElementsByProjectId
} from "../services/textElementService";
import { validateFrontendTextElementInput } from "../validation/textElementValidation";
import { createRequestId, successResponse } from "../utils/response";

const getRequestId = (res: Response): string => {
  const requestId = res.locals.requestId;
  return typeof requestId === "string" ? requestId : createRequestId();
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

    const validation = validateFrontendTextElementInput(req.body);
    if (!validation.ok) {
      throw new HttpError(400, "VALIDATION_ERROR", "Validation error", validation.errors);
    }

    const exists = await projectExists(projectId);
    if (!exists) {
      throw new HttpError(404, "NOT_FOUND", "Project not found", []);
    }

    const element = await createTextElementFromFrontend(
      projectId,
      validation.value,
      validation.value.trackId
    );

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
