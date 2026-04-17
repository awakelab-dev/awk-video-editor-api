import { Db } from "mongodb";
import {
  closeMongoConnection,
  connectMongo,
  getMongoDb,
} from "../config/mongodb";

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

export const connectToMongo = connectDB;

export async function closeMongo(): Promise<void> {
  await closeMongoConnection();
}
