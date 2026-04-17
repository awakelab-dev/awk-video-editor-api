import app from './app'
import { connectToMongo, closeMongo } from "./db/mongoClient"
import { env } from './config/env'

async function startServer(): Promise<void> {
  try {
    await connectToMongo(); 

    const PORT = env.PORT || 4000;

    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}/api/v1/projects/123/elements`);
    });

    const gracefulShutdown = async () => {
      await closeMongo();
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

void startServer();
