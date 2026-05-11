import { Db } from "mongodb";
import {
  closeMongoConnection,
  connectMongo,
  getMongoDb,
} from "../config/mongodb";

import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not defined");
}

export async function connectToMongo(): Promise<void> {
  await connectMongo();
  console.log("Mongo connected");
}

export function getDb(): Db {
  const database = getMongoDb();
  if (!database) {
    throw new Error("Database not initialized");
  }
  return database;
}

export async function closeMongo(): Promise<void> {
  await closeMongoConnection();
}
