import { Router } from "express";
import {
  createTextElementHandler,
  getTextElementsHandler
} from "../controllers/textElementController";

const router = Router({ mergeParams: true });

router.post("/", createTextElementHandler);
router.get("/", getTextElementsHandler);

export default router;
