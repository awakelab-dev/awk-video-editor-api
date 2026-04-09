import { Collection } from "mongodb";
import { getDb } from "../db/mongoClient";
import { TextElementDoc } from "../types/textElement";

const COLLECTION_NAME = "textElements";

function getCollection(): Collection<TextElementDoc> {
  return getDb().collection<TextElementDoc>(COLLECTION_NAME);
}

export async function insertTextElement(doc: TextElementDoc): Promise<void> {
  const collection = getCollection();
  await collection.insertOne(doc);
}

export async function findTextElementsByProjectId(
  projectId: string
): Promise<TextElementDoc[]> {
  const collection = getCollection();
  return collection.find({ projectId }).sort({ createdAt: 1 }).toArray();
}

export async function ensureTextElementIndexes(): Promise<void> {
  const collection = getCollection();
  await collection.createIndex({ projectId: 1 });
}
