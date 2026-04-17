import express from "express";
import { env } from '../config/env'

const router = express.Router();

type ImageSearchResult = {
  query: string;
  photos: string[];
};

async function searchPexels(query: string): Promise<ImageSearchResult> {
  const url =
    "https://api.pexels.com/v1/search?query=" +
    encodeURIComponent(query) +
    "&per_page=4";

  const response = await fetch(url, {
    headers: {
      Authorization: env.PEXELS_API_KEY,
    },
  });

  const data = await response.json();

  return {
    query,
    photos: Array.isArray(data.photos)
      ? data.photos.map((p: any) => p.src.medium)
      : [],
  };
}

router.post("/images", async (req, res) => {
  try {
    const { scenes } = req.body;

    if (!Array.isArray(scenes)) {
      return res.json({ images: [] });
    }

    const queries = scenes
      .flatMap((scene: any) => scene.storyboard?.elements || [])
      .slice(0, 4);

    const uniqueQueries = [...new Set(queries)];

    const results = await Promise.all(
      uniqueQueries.map((q: string) => searchPexels(q))
    );

    return res.json({ images: results });
  } catch (error) {
    return res.status(500).json({ error: "Error buscando imágenes" });
  }
});

export default router;
