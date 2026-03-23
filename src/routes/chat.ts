import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function isValidMessage(value: any) {
  return (
    value &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string"
  );
}

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || !messages.every(isValidMessage)) {
      return res.status(400).json({ message: "Invalid messages" });
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");

    const trimmedText = (lastUserMessage?.content ?? "").slice(0, 4500);

    const systemPrompt = `
Eres un sistema que transforma texto educativo en escenas.
Máximo 4 escenas.
Devuelve JSON válido con:
- scene_id
- title
- slide_content.bullet_points
- voiceover_script
- visual_notes
- storyboard.composition
- storyboard.elements
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: trimmedText },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ message: "Empty response" });
    }

    const parsed = JSON.parse(raw);

    return res.json(parsed);

  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;