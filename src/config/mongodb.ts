import { Db, MongoClient } from 'mongodb'
import { env } from './env'

let client: MongoClient | null = null
let database: Db | null = null
let connected = false

export async function connectMongo(): Promise<void> {
  if (!env.MONGODB_URI || connected) {
    return
  }

  client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  database = client.db(env.MONGODB_DB_NAME)
  //await database.collection('projects').createIndex({ id: 1 }, { unique: true })
  //await database.collection('editor_states').createIndex({ projectId: 1 }, { unique: true })
  //await database.collection('project_snapshots').createIndex({ projectId: 1 }, { unique: true })
  connected = true
}

export function getMongoDb(): Db | null {
  return database
}

export function isMongoConnected(): boolean {
  return connected
}

export async function pingMongo(): Promise<boolean> {
  if (!env.MONGODB_URI) {
    return false
  }

  try {
    if (!connected) {
      await connectMongo()
    }

    if (!database) {
      return false
    }

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
}
