import { Router, Request, Response } from "express";
import multer from "multer";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
});

type MulterRequest = Request & {
    file?: Express.Multer.File;
};

router.post(
    "/pdf-to-text",
    upload.single("file"),
    async (req: MulterRequest, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            const uint8Array = new Uint8Array(req.file.buffer);

            const pdf = await pdfjsLib.getDocument(uint8Array).promise;

            let text = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();

                text += content.items.map((item: any) => item.str).join(" ") + "\n";
            }

            return res.json({
                filename: req.file.originalname,
                pages: pdf.numPages,
                text,
            });

        } catch (error) {
            return res.status(500).json({
                error: "Error processing PDF",
                details: error instanceof Error ? error.message : error,
            });
        }
    }
);

export default router;