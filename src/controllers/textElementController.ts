import { Request, Response, NextFunction } from "express";
import { HttpError } from "../errors/HttpError";
import { projectExists } from "../services/projectService";
import {
  createTextElementFromFrontend,
  getTextElementsByProjectId
} from "../services/textElementService";
import { validateFrontendTextElementInput } from "../validation/textElementValidation";
import { sendSuccess } from "../utils/response"; 


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
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Validation error",
        validation.errors
      );
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

    
    sendSuccess(res, element, 201);

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

    
    sendSuccess(res, elements, 200);

  } catch (error) {
    next(error);
  }
}