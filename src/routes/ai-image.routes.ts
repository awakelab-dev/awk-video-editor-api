import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

router.post("/generate-image", async (req: Request, res: Response) => {
    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string") {
            return res.status(400).json({ message: "Invalid prompt" });
        }

        const result = await openai.images.generate({
            model: "gpt-image-1",
            prompt,
            size: "1024x1024",
        });

        const image = result.data?.[0]?.b64_json;

        if (!image) {
            return res.status(500).json({ message: "Image generation failed" });
        }

        res.setHeader("Content-Type", "image/png");
        res.send(Buffer.from(image, "base64"));

    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
});

export default router;