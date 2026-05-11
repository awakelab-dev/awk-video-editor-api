import { Collection } from "mongodb";
import { getDb } from "../db/mongoClient";
import { ElementDoc } from "../types/element";

const COLLECTION_NAME = "textElements";

function getCollection(): Collection<ElementDoc> {
  return getDb().collection<ElementDoc>(COLLECTION_NAME);
}

export async function insertElement(doc: ElementDoc): Promise<void> {
  const collection = getCollection();
  console.log("INSERTING ELEMENT", doc);
  await collection.insertOne(doc);
  console.log("ELEMENT INSERTED");
}

export async function findElementsByProjectId(
  projectId: string
): Promise<ElementDoc[]> {
  const collection = getCollection();
  return collection.find({ projectId }).sort({ createdAt: 1 }).toArray();
}

export async function ensureElementIndexes(): Promise<void> {
  const collection = getCollection();
  await collection.createIndex({ projectId: 1 });
}
