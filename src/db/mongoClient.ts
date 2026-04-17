import dotenv from "dotenv";
import { MongoClient, Db } from "mongodb";

dotenv.config();

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB;

  if (!uri) {
    throw new Error("MONGO_URI is not defined");
  }

  if (!db) {
    client = new MongoClient(uri);
    await client.connect();
    db = dbName ? client.db(dbName) : client.db();
    console.log("Mongo connected");
  }

  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error("DB not initialized");
  }
  return db;
}

export const connectToMongo = connectDB;

export async function closeMongo(): Promise<void> {
  if (!client) {
    db = null;
    return;
  }

  await client.close();
  client = null;
  db = null;
}
