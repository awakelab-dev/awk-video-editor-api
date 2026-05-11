import { getMongoDb } from "../config/mongodb";

export type ElementUpdateChange = {
  type: "element.update";
  elementId: string;
  patch: Record<string, unknown>;
};

export type ElementAddToTrackChange = {
  type: "element.add-to-track";
  trackId: string;
  elementId: string;
  index?: number;
};

export type ElementRemoveFromTrackChange = {
  type: "element.remove-from-track";
  trackId: string;
  elementId: string;
};

export type ElementMoveChange = {
  type: "element.move";
  elementId: string;
  toTrackId: string;
  toIndex?: number;
};

export type ProjectPatchChange =
  | ElementUpdateChange
  | ElementAddToTrackChange
  | ElementRemoveFromTrackChange
  | ElementMoveChange;

export type ProjectPatchInput = {
  revision: number;
  changes: ProjectPatchChange[];
};

export type ProjectPatchResponse = {
  projectId: string;
  revision: number;
  appliedChanges: number;
};

export type ProjectPatchResult =
  | {
      ok: true;
      data: ProjectPatchResponse;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isTrackRecord = (value: unknown): value is Record<string, unknown> => {
  return isRecord(value);
};

const getProjectRevision = (project: Record<string, unknown>): number => {
  return typeof project.revision === "number" ? project.revision : 0;
};

function addElementIdToTrack(
  track: Record<string, unknown>,
  elementId: string,
  index?: number
): Record<string, unknown> {
  const currentElementIds = Array.isArray(track.elementIds)
    ? track.elementIds.filter((value): value is string => typeof value === "string")
    : [];

  if (currentElementIds.includes(elementId)) {
    return {
      ...track,
      elementIds: currentElementIds
    };
  }

  const nextElementIds = [...currentElementIds];
  if (typeof index === "number") {
    nextElementIds.splice(index, 0, elementId);
  } else {
    nextElementIds.push(elementId);
  }

  return {
    ...track,
    elementIds: nextElementIds
  };
}

function removeElementIdFromTrack(
  track: Record<string, unknown>,
  elementId: string
): { track: Record<string, unknown>; changed: boolean } {
  const currentElementIds = Array.isArray(track.elementIds)
    ? track.elementIds.filter((value): value is string => typeof value === "string")
    : [];

  if (!currentElementIds.includes(elementId)) {
    return {
      track: {
        ...track,
        elementIds: currentElementIds
      },
      changed: false
    };
  }

  return {
    track: {
      ...track,
      elementIds: currentElementIds.filter((currentId) => currentId !== elementId)
    },
    changed: true
  };
}

function getTrackElementIds(track: Record<string, unknown>): string[] {
  return Array.isArray(track.elementIds)
    ? track.elementIds.filter((value): value is string => typeof value === "string")
    : [];
}

function insertElementId(
  elementIds: string[],
  elementId: string,
  index?: number
): string[] {
  if (elementIds.includes(elementId)) {
    return [...elementIds];
  }

  const nextElementIds = [...elementIds];
  if (typeof index === "number") {
    nextElementIds.splice(index, 0, elementId);
  } else {
    nextElementIds.push(elementId);
  }

  return nextElementIds;
}

function areElementIdsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function moveElementBetweenTracks(
  tracks: Record<string, unknown>[],
  elementId: string,
  toTrackId: string,
  toIndex?: number
): { tracks: Record<string, unknown>[]; changed: boolean } {
  const sourceTrackIndex = tracks.findIndex((track) => getTrackElementIds(track).includes(elementId));
  if (sourceTrackIndex < 0) {
    return {
      tracks,
      changed: false
    };
  }

  const sourceTrack = tracks[sourceTrackIndex];
  const sourceElementIds = getTrackElementIds(sourceTrack);
  const nextSourceElementIds = sourceElementIds.filter((currentId) => currentId !== elementId);
  const destinationTrackIndex = tracks.findIndex((track) => track.id === toTrackId);

  if (destinationTrackIndex === sourceTrackIndex) {
    const nextElementIds = insertElementId(nextSourceElementIds, elementId, toIndex);
    if (areElementIdsEqual(sourceElementIds, nextElementIds)) {
      return {
        tracks,
        changed: false
      };
    }

    const nextTracks = [...tracks];
    nextTracks[sourceTrackIndex] = {
      ...sourceTrack,
      elementIds: nextElementIds
    };

    return {
      tracks: nextTracks,
      changed: true
    };
  }

  const nextTracks = [...tracks];
  nextTracks[sourceTrackIndex] = {
    ...sourceTrack,
    elementIds: nextSourceElementIds
  };

  if (destinationTrackIndex < 0) {
    nextTracks.push({
      id: toTrackId,
      name: toTrackId,
      type: "text",
      elementIds: insertElementId([], elementId, toIndex)
    });

    return {
      tracks: nextTracks,
      changed: true
    };
  }

  const destinationTrack = tracks[destinationTrackIndex];
  const destinationElementIds = getTrackElementIds(destinationTrack);
  nextTracks[destinationTrackIndex] = {
    ...destinationTrack,
    elementIds: insertElementId(destinationElementIds, elementId, toIndex)
  };

  return {
    tracks: nextTracks,
    changed: true
  };
}

function buildRevisionFilter(projectId: string, revision: number): Record<string, unknown> {
  if (revision === 0) {
    return {
      id: projectId,
      $or: [{ revision: 0 }, { revision: { $exists: false } }]
    };
  }

  return {
    id: projectId,
    revision
  };
}

export async function projectExists(projectId: string): Promise<boolean> {
  return projectId !== "not-found";
}

export async function patchProject(
  projectId: string,
  input: ProjectPatchInput
): Promise<ProjectPatchResult> {
  const db = getMongoDb();
  if (!db) {
    return {
      ok: false,
      status: 503,
      message: "MongoDB is not connected"
    };
  }

  const projectsCollection: any = db.collection("projects");
  const project = await projectsCollection.findOne({ id: projectId });

  if (!project || !isRecord(project)) {
    return {
      ok: false,
      status: 404,
      message: "Project not found"
    };
  }

  const currentRevision = getProjectRevision(project);
  if (input.revision !== currentRevision) {
    return {
      ok: false,
      status: 409,
      message: "Project revision conflict"
    };
  }

  const currentElements = isRecord(project.elements)
    ? (project.elements as Record<string, unknown>)
    : {};
  const nextElements: Record<string, unknown> = { ...currentElements };
  const currentTracks = Array.isArray(project.tracks)
    ? project.tracks.filter(isTrackRecord)
    : [];
  const nextTracks = currentTracks.map((track) => ({ ...track }));
  const now = new Date().toISOString();
  let projectChanged = false;
  let tracksChanged = false;

  for (const change of input.changes) {
    const currentElement = nextElements[change.elementId];
    if (!isRecord(currentElement)) {
      return {
        ok: false,
        status: 404,
        message: "Element not found"
      };
    }

    if (change.type === "element.update") {
      projectChanged = true;
      nextElements[change.elementId] = {
        ...currentElement,
        ...change.patch,
        updatedAt: now
      };
      continue;
    }

    if (change.type === "element.add-to-track") {
      const trackIndex = nextTracks.findIndex((track) => track.id === change.trackId);
      projectChanged = true;
      tracksChanged = true;
      if (trackIndex >= 0) {
        nextTracks[trackIndex] = addElementIdToTrack(
          nextTracks[trackIndex],
          change.elementId,
          change.index
        );
        continue;
      }

      nextTracks.push(
        addElementIdToTrack(
          {
            id: change.trackId,
            name: change.trackId,
            type: "text",
            elementIds: []
          },
          change.elementId,
          change.index
        )
      );
      continue;
    }

    if (change.type === "element.move") {
      const moveResult = moveElementBetweenTracks(
        nextTracks,
        change.elementId,
        change.toTrackId,
        change.toIndex
      );
      if (!moveResult.changed) {
        continue;
      }

      projectChanged = true;
      tracksChanged = true;
      nextTracks.splice(0, nextTracks.length, ...moveResult.tracks);
      continue;
    }

    const trackIndex = nextTracks.findIndex((track) => track.id === change.trackId);
    if (trackIndex < 0) {
      continue;
    }

    const removalResult = removeElementIdFromTrack(
      nextTracks[trackIndex],
      change.elementId
    );
    if (!removalResult.changed) {
      continue;
    }

    projectChanged = true;
    tracksChanged = true;
    nextTracks[trackIndex] = removalResult.track;
  }

  if (!projectChanged) {
    return {
      ok: true,
      data: {
        projectId,
        revision: currentRevision,
        appliedChanges: 0
      }
    };
  }

  const result = await projectsCollection.updateOne(
    buildRevisionFilter(projectId, currentRevision),
    {
      $set: {
        elements: nextElements,
        ...(tracksChanged ? { tracks: nextTracks } : {}),
        updatedAt: now
      },
      $inc: {
        revision: 1
      }
    }
  );

  if (result.matchedCount === 0) {
    return {
      ok: false,
      status: 409,
      message: "Project revision conflict"
    };
  }

  return {
    ok: true,
    data: {
      projectId,
      revision: currentRevision + 1,
      appliedChanges: input.changes.length
    }
  };
}
