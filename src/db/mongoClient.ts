import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI;

if (!uri) {
  throw new Error("MONGO_URI is not defined");
}

const client = new MongoClient(uri);

let db: Db;

export async function connectToMongo(): Promise<void> {
  await client.connect();
  db = client.db(); // usa DB del URI
  console.log("✅ Mongo connected");
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

export async function closeMongo(): Promise<void> {
  await client.close();
}