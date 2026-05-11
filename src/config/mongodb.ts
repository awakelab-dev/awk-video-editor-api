import { Db, MongoClient } from 'mongodb'
import { env } from './env'

let client: MongoClient | null = null
let database: Db | null = null
let connected = false
let testDatabase: any = null
let testConnected = false

export async function connectMongo(): Promise<void> {
  if (testDatabase) {
    connected = testConnected
    database = testDatabase as Db
    return
  }

  if (!env.MONGODB_URI || connected) {
    return
  }

  client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  database = client.db(env.MONGODB_DB_NAME)
  await ensureIndexes(database)
  connected = true
}

export async function ensureIndexes(db: any): Promise<void> {
  await db.collection('projects').createIndex({ id: 1 }, { unique: true })
  await db.collection('projects').createIndex({ ownerUserId: 1, updatedAt: -1 })
  await db.collection('editor_states').createIndex({ projectId: 1 }, { unique: true })
  await db.collection('project_snapshots').createIndex({ projectId: 1 }, { unique: true })
  await db.collection('users').createIndex({ id: 1 }, { unique: true })
  await db.collection('users').createIndex({ email: 1 }, { unique: true })
  await db.collection('users').createIndex({ username: 1 }, { unique: true })
}

export function getMongoDb(): Db | null {
  return (testDatabase ?? database) as Db | null
}

export function isMongoConnected(): boolean {
  return testDatabase ? testConnected : connected
}

export async function pingMongo(): Promise<boolean> {
  if (testDatabase) return testConnected
  if (!env.MONGODB_URI) return false
  try {
    if (!connected) await connectMongo()
    if (!database) return false
    await database.command({ ping: 1 })
    return true
  } catch {
    return false
  }
}

export async function closeMongoConnection(): Promise<void> {
  if (client) {
    await client.close()
  }
  client = null
  database = null
  connected = false
  testDatabase = null
  testConnected = false
}

export function __setTestMongoState(db: any, isConnected = true) {
  testDatabase = db
  testConnected = isConnected
}
