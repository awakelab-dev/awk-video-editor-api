import express from "express";

const voiceMap = require("../config/voces.json");

const router = express.Router();

router.post("/tts", async (req, res) => {
    try {
        const { text, language, gender, accent } = req.body;

        // 1. Validación básica
        if (!text || !language || !gender) {
            return res.status(400).json({
                error: "Missing required fields",
            });
        }

        // 2. Buscar voz
        const voiceId =
            voiceMap?.[language]?.[gender]?.[accent]?.voice_id ||
            voiceMap?.[language]?.[gender]?.default?.voice_id;

        if (!voiceId) {
            return res.status(404).json({
                error: "Voice not found",
            });
        }

        // 3. Llamada ElevenLabs
        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
                method: "POST",
                headers: {
                    "xi-api-key": process.env.ELEVEN_API_KEY!,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text,
                    model_id: "eleven_multilingual_v2",
                }),
            }
        );

        // 4. Control de error API
        if (!response.ok) {
            const err = await response.text();
            return res.status(500).json({
                error: "ElevenLabs error",
                details: err,
            });
        }

        // 5. Audio
        const audio = await response.arrayBuffer();

        res.setHeader("Content-Type", "audio/mpeg");
        return res.send(Buffer.from(audio));

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Internal server error",
        });
    }
});

export default router;