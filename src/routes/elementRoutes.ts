import { Router } from "express";
import {
  createElementHandler,
  getElementsHandler
} from "../controllers/elementController";

const router = Router({ mergeParams: true });

router.post("/projects/:projectId/elements", createElementHandler);
router.get("/projects/:projectId/elements", getElementsHandler);

export default router;
