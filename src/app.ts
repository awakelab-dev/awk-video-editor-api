import cors from 'cors'
import express from 'express'
import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();
import { testRouter } from './routes/test.route'
import chatRoutes from './routes/chat'
import imagesRoutes from "./routes/images"
import elementRoutes from "./routes/elementRoutes"

const app = express()
export default app;

app.use(cors())
app.use(express.json())
app.use("/api", chatRoutes);
app.use("/api", imagesRoutes)
app.use("/api/v1", elementRoutes)

app.use((
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  res.status(err.status || 500).json({
    error: {
      code: err.code || "INTERNAL_ERROR",
      message: err.message,
      details: err.details || []
    },
    meta: {
      requestId: "dev-id"
    }
  });
});

app.get('/health', (_request, response) => {
  response.status(200).json({
    ok: true,
    status: 'healthy',
  })
})

app.use('/api', testRouter)
