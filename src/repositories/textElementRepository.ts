import { Collection } from "mongodb";
import { getDb } from "../db/mongoClient";
import { ElementDoc } from "../types/textElement";

const COLLECTION_NAME = "textElements";

function getCollection(): Collection<ElementDoc> {
  return getDb().collection<ElementDoc>(COLLECTION_NAME);
}

export async function insertTextElement(doc: ElementDoc): Promise<void> {
  const collection = getCollection();
  await collection.insertOne(doc);
}

export async function findTextElementsByProjectId(
  projectId: string
): Promise<ElementDoc[]> {
  const collection = getCollection();
  return collection.find({ projectId }).sort({ createdAt: 1 }).toArray();
}

export async function ensureTextElementIndexes(): Promise<void> {
  const collection = getCollection();
  await collection.createIndex({ projectId: 1 });
}
