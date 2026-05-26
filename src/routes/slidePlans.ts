import { Router, Request, Response } from "express";
import { sendSuccess } from "../lib/response";
import { validateRequest } from "../middleware/validate.middleware";
import { slidePlanRequestSchema } from "../modules/slide-plans/slide-plans.schemas";
import { SlidePlanService } from "../modules/slide-plans/slide-plans.service";

const router = Router();
const slidePlanService = new SlidePlanService();

router.post(
  "/slide-plans",
  validateRequest({ body: slidePlanRequestSchema }),
  async (req: Request, res: Response) => {
    const plan = await slidePlanService.generatePlan(req.body as never);
    sendSuccess(res, 200, "Slide plan generated successfully", plan);
  },
);

router.post(
  "/slide-plans/editor-template",
  validateRequest({ body: slidePlanRequestSchema }),
  async (req: Request, res: Response) => {
    const template = await slidePlanService.generateEditorTemplate(
      req.body as never,
    );
    sendSuccess(res, 200, "Editor template generated successfully", template);
  },
);

export default router;
