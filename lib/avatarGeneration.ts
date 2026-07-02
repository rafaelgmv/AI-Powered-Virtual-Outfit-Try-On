import { readFile } from "fs/promises";
import path from "path";

// Front-view try-on generation, backed by a local CatVTON service.
// CatVTON does one garment per pass and preserves the input pose, so:
//   - we run two passes: upper (outerwear if chosen, else top), then lower (bottom)
//   - it produces ONE front image (no side view — the model can't rotate the pose)
// The CatVTON Python service must be running (see CATVTON_SETUP.md).

const DEFAULT_VTON_URL = "http://127.0.0.1:8500";

const mimeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

const getMimeType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  return mimeByExtension[ext] ?? "application/octet-stream";
};

// Read an image that lives under /public (uploads or presets) and return base64.
const readLocalImage = async (imageUrl: string) => {
  if (!imageUrl.startsWith("/uploads/") && !imageUrl.startsWith("/presets/")) {
    throw new Error("Invalid image path.");
  }

  const publicDir = path.resolve(process.cwd(), "public");
  const absolutePath = path.resolve(process.cwd(), "public", imageUrl.slice(1));

  if (!absolutePath.startsWith(publicDir)) {
    throw new Error("Invalid image path.");
  }

  const file = await readFile(absolutePath);
  return { mimeType: getMimeType(absolutePath), base64: file.toString("base64") };
};

// Fetch a remote product image (the SerpAPI thumbnails) as base64.
const fetchRemoteImageBase64 = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
};

export type OutfitItem = {
  category: string; // Tops | Bottoms | Shoes | Outerwear
  title: string;
  image: string; // remote product image URL
};

export type AvatarGenerationInput = {
  portraitUrl: string; // /uploads/... or /presets/...
  bodyType: string;
  height: string;
  weight: string;
  outfit: OutfitItem[];
};

// One generated image, ready to drop into an <img src>.
export type GeneratedImage = { mimeType: string; base64: string; dataUrl: string };

type ClothType = "upper" | "lower" | "overall";

// One pass through the CatVTON service: person + one garment -> person wearing it.
const tryOn = async (
  personBase64: string,
  clothBase64: string,
  clothType: ClothType,
): Promise<string> => {
  const baseUrl = (process.env.VTON_SERVICE_URL ?? DEFAULT_VTON_URL).replace(/\/+$/, "");

  const response = await fetch(`${baseUrl}/tryon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person: personBase64, cloth: clothBase64, cloth_type: clothType }),
  }).catch(() => {
    throw new Error(
      "Could not reach the try-on service. Make sure the CatVTON service is running (see CATVTON_SETUP.md).",
    );
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Try-on service failed (${response.status}). ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as { image?: string };
  if (!data.image) {
    throw new Error("The try-on service did not return an image.");
  }
  return data.image; // base64 PNG
};

const findItem = (outfit: OutfitItem[], category: string) =>
  outfit.find((item) => item.category.toLowerCase() === category.toLowerCase());

// Generate the front try-on: upper garment first, then lower on that result.
// Returns one image (the front view). Shoes are ignored; side view is not produced.
export async function generateAvatarImages(
  input: AvatarGenerationInput,
): Promise<{ front: GeneratedImage }> {
  const portrait = await readLocalImage(input.portraitUrl);

  // Upper = outerwear if selected (it's the dominant visible layer), else the top.
  const upperItem = findItem(input.outfit, "Outerwear") ?? findItem(input.outfit, "Tops");
  const lowerItem = findItem(input.outfit, "Bottoms");

  let personBase64 = portrait.base64;
  let applied = 0;

  if (upperItem?.image) {
    const cloth = await fetchRemoteImageBase64(upperItem.image);
    if (cloth) {
      personBase64 = await tryOn(personBase64, cloth, "upper");
      applied += 1;
    }
  }

  if (lowerItem?.image) {
    const cloth = await fetchRemoteImageBase64(lowerItem.image);
    if (cloth) {
      personBase64 = await tryOn(personBase64, cloth, "lower");
      applied += 1;
    }
  }

  if (applied === 0) {
    throw new Error("None of the selected garment images could be loaded for the try-on.");
  }

  return {
    front: {
      mimeType: "image/png",
      base64: personBase64,
      dataUrl: `data:image/png;base64,${personBase64}`,
    },
  };
}
