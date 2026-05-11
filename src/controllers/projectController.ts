import { Request, Response } from "express";
import {
  ElementAddToTrackChange,
  ElementMoveChange,
  ElementRemoveFromTrackChange,
  ElementUpdateChange,
  patchProject,
  ProjectPatchChange,
  ProjectPatchInput
} from "../services/projectService";

type ValidationError = {
  field: string;
  message: string;
};

const reservedPatchKeys = new Set([
  "id",
  "type",
  "trackId",
  "createdAt",
  "updatedAt"
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

function validatePatchPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isRecord(body)) {
    return [{ field: "body", message: "Body must be a JSON object" }];
  }

  if (typeof body.revision !== "number" || body.revision < 0) {
    errors.push({
      field: "revision",
      message: "revision must be a number >= 0"
    });
  }

  if (!Array.isArray(body.changes) || body.changes.length === 0) {
    errors.push({
      field: "changes",
      message: "changes must be a non-empty array"
    });
    return errors;
  }

  body.changes.forEach((change, index) => {
    if (!isRecord(change)) {
      errors.push({
        field: `changes.${index}`,
        message: "change must be an object"
      });
      return;
    }

    if (!isNonEmptyString(change.elementId)) {
      errors.push({
        field: `changes.${index}.elementId`,
        message: "elementId is required"
      });
    }

    if (change.type === "element.update") {
      if (!isRecord(change.patch)) {
        errors.push({
          field: `changes.${index}.patch`,
          message: "patch must be an object"
        });
        return;
      }

      Object.keys(change.patch).forEach((key) => {
        if (reservedPatchKeys.has(key)) {
          errors.push({
            field: `changes.${index}.patch.${key}`,
            message: `${key} cannot be updated with element.update`
          });
        }
      });
      return;
    }

    if (change.type === "element.add-to-track") {
      if (!isNonEmptyString(change.trackId)) {
        errors.push({
          field: `changes.${index}.trackId`,
          message: "trackId is required"
        });
      }

      if (
        change.index !== undefined &&
        (
          typeof change.index !== "number" ||
          !Number.isInteger(change.index) ||
          change.index < 0
        )
      ) {
        errors.push({
          field: `changes.${index}.index`,
          message: "index must be an integer >= 0 when provided"
        });
      }
      return;
    }

    if (change.type === "element.remove-from-track") {
      if (!isNonEmptyString(change.trackId)) {
        errors.push({
          field: `changes.${index}.trackId`,
          message: "trackId is required"
        });
      }
      return;
    }

    if (change.type === "element.move") {
      if (!isNonEmptyString(change.toTrackId)) {
        errors.push({
          field: `changes.${index}.toTrackId`,
          message: "toTrackId is required"
        });
      }

      if (
        change.toIndex !== undefined &&
        (
          typeof change.toIndex !== "number" ||
          !Number.isInteger(change.toIndex) ||
          change.toIndex < 0
        )
      ) {
        errors.push({
          field: `changes.${index}.toIndex`,
          message: "toIndex must be an integer >= 0 when provided"
        });
      }
      return;
    }

    errors.push({
      field: `changes.${index}.type`,
      message: 'only "element.update", "element.add-to-track", "element.remove-from-track" and "element.move" are supported'
    });
  });

  return errors;
}

function toProjectPatchChange(change: Record<string, unknown>): ProjectPatchChange {
  if (change.type === "element.add-to-track") {
    const addToTrackChange: ElementAddToTrackChange = {
      type: "element.add-to-track",
      trackId: change.trackId as string,
      elementId: change.elementId as string
    };

    if (typeof change.index === "number") {
      addToTrackChange.index = change.index;
    }

    return addToTrackChange;
  }

  if (change.type === "element.remove-from-track") {
    const removeFromTrackChange: ElementRemoveFromTrackChange = {
      type: "element.remove-from-track",
      trackId: change.trackId as string,
      elementId: change.elementId as string
    };

    return removeFromTrackChange;
  }

  if (change.type === "element.move") {
    const moveChange: ElementMoveChange = {
      type: "element.move",
      elementId: change.elementId as string,
      toTrackId: change.toTrackId as string
    };

    if (typeof change.toIndex === "number") {
      moveChange.toIndex = change.toIndex;
    }

    return moveChange;
  }

  const updateChange: ElementUpdateChange = {
    type: "element.update",
    elementId: change.elementId as string,
    patch: change.patch as Record<string, unknown>
  };

  return updateChange;
}

function toProjectPatchInput(body: Record<string, unknown>): ProjectPatchInput {
  return {
    revision: body.revision as number,
    changes: (body.changes as Array<Record<string, unknown>>).map(toProjectPatchChange)
  };
}

export async function patchProjectHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ success: false, message: "projectId is required" });
      return;
    }

    const validationErrors = validatePatchPayload(req.body);
    if (validationErrors.length > 0) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors
      });
      return;
    }

    const result = await patchProject(projectId, toProjectPatchInput(req.body));
    if (!result.ok) {
      res.status(result.status).json({
        success: false,
        message: result.message
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error("Error patching project:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
