import { readFile } from "fs/promises";
import path from "path";

type StyleDescriptionInput = {
  height: string;
  weight: string;
  bodyType: string;
  selectedStyle: string;
  portraitUrl?: string | null;
  inspirationImageUrls: string[];
  sizes?: { top: string; pants: string; shoes: string };
  styleNotes?: string;
};

export type CategoryQueries = {
  tops: string;
  bottoms: string;
  shoes: string;
  outerwear: string;
};

export type StyleDescriptionResult = {
  description: string;
  queries: CategoryQueries;
};

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3";

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

const getOutputText = (responseBody: unknown) => {
  if (
    typeof responseBody === "object" &&
    responseBody !== null &&
    "output_text" in responseBody &&
    typeof (responseBody as { output_text?: unknown }).output_text === "string"
  ) {
    return (responseBody as { output_text: string }).output_text;
  }

  return "";
};

const getOllamaText = (responseBody: unknown) => {
  if (
    typeof responseBody === "object" &&
    responseBody !== null &&
    "response" in responseBody &&
    typeof (responseBody as { response?: unknown }).response === "string"
  ) {
    return (responseBody as { response: string }).response;
  }

  return "";
};

const getGeminiText = (responseBody: unknown) => {
  if (
    typeof responseBody !== "object" ||
    responseBody === null ||
    !("candidates" in responseBody) ||
    !Array.isArray((responseBody as { candidates?: unknown }).candidates)
  ) {
    return "";
  }

  const candidates = (responseBody as { candidates: unknown[] }).candidates;

  for (const candidate of candidates) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("content" in candidate) ||
      typeof (candidate as { content?: unknown }).content !== "object" ||
      (candidate as { content?: unknown }).content === null
    ) {
      continue;
    }

    const content = (candidate as { content: { parts?: unknown } }).content;

    if (!Array.isArray(content.parts)) {
      continue;
    }

    const text = content.parts
      .map((part) => {
        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }

        return "";
      })
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
};

const parseProfileJson = (raw: string): StyleDescriptionResult => {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const jsonSlice = start !== -1 && end !== -1 ? trimmed.slice(start, end + 1) : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    throw new Error("The model returned a malformed style profile.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The model returned an empty style profile.");
  }

  const obj = parsed as { summary?: unknown; queries?: unknown };
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";

  if (!summary) {
    throw new Error("The model returned an empty style profile.");
  }

  const q = (typeof obj.queries === "object" && obj.queries !== null ? obj.queries : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  return {
    description: summary,
    queries: {
      tops: str(q.tops),
      bottoms: str(q.bottoms),
      shoes: str(q.shoes),
      outerwear: str(q.outerwear),
    },
  };
};

const getProviderErrorMessage = async (response: Response, providerName: string) => {
  const fallback = `${providerName} request failed with status ${response.status}.`;

  try {
    const data = (await response.json()) as unknown;

    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "object" &&
      (data as { error?: unknown }).error !== null
    ) {
      const errorObject = (data as { error: { message?: unknown } }).error;

      if (typeof errorObject.message === "string" && errorObject.message.trim()) {
        return `${providerName}: ${errorObject.message.trim()}`;
      }
    }
  } catch {
    try {
      const text = (await response.text()).trim();

      if (text) {
        return `${providerName}: ${text}`;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const readUploadedImage = async (imageUrl: string) => {
  // Allow uploaded images and built-in preset portraits; both live under /public.
  if (!imageUrl.startsWith("/uploads/") && !imageUrl.startsWith("/presets/")) {
    throw new Error("Invalid inspiration image path.");
  }

  const publicDir = path.resolve(process.cwd(), "public");
  const absoluteImagePath = path.resolve(process.cwd(), "public", imageUrl.slice(1));

  if (!absoluteImagePath.startsWith(publicDir)) {
    throw new Error("Invalid inspiration image path.");
  }

  const file = await readFile(absoluteImagePath);
  return {
    mimeType: getMimeType(absoluteImagePath),
    base64: file.toString("base64"),
  };
};

const buildPrompt = (input: StyleDescriptionInput) => {
  const sizeLines = input.sizes
    ? [
        input.sizes.top ? `Top size: ${input.sizes.top}` : "",
        input.sizes.pants ? `Pants waist: ${input.sizes.pants}` : "",
        input.sizes.shoes ? `Shoe size (EU): ${input.sizes.shoes}` : "",
      ].filter(Boolean)
    : [];

  // Images are sent in a known order: portrait first (if present), then references.
  const hasPortrait = Boolean(input.portraitUrl);
  const referenceCount = input.inspirationImageUrls.filter((url) => url !== input.portraitUrl).length;

  const imageGuide: string[] = [];
  if (hasPortrait && referenceCount > 0) {
    imageGuide.push(
      "Image order: the FIRST image is the user's own portrait (the person who will wear the clothes). " +
        `The remaining ${referenceCount} image(s) are STYLE REFERENCE photos chosen for inspiration.`,
      "Treat the portrait and the reference photos as equal style cues and blend them into one coherent look.",
      "However, if the reference photos are SEVERELY inconsistent with the portrait's apparent style (e.g. clashing aesthetics that cannot be reconciled), DISREGARD the reference photos entirely and base the style solely on the portrait.",
      "If you do this, state it briefly in the '## Style Identity' section (e.g. note that the references conflicted with the portrait, so the look follows the portrait).",
    );
  } else if (hasPortrait) {
    imageGuide.push(
      "The image provided is the user's own portrait. Use it for appearance, fit and coloring, and — if it shows a clear styled look — for aesthetic direction too.",
    );
  } else {
    imageGuide.push(
      "The image(s) provided are style reference photos chosen for inspiration.",
    );
  }

  return [
    "Create one coherent personal style profile by combining the user's body data, chosen style, the provided images, and any notes.",
    "",
    "User data:",
    `Height: ${input.height} cm`,
    `Weight: ${input.weight} kg`,
    `Body type: ${input.bodyType}`,
    `Preferred style: ${input.selectedStyle}`,
    ...sizeLines,
    input.styleNotes ? `User notes: ${input.styleNotes}` : "",
    "",
    ...imageGuide,
    "",
    "Use the images to infer aesthetic direction, fit preference, color mood, fabric feel, and silhouette tendencies.",
    "If the images show a recognizable team, brand, athlete, character, or subculture, reflect that specifically in the shopping queries.",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildSystemInstruction = () =>
  [
    "You are an expert personal stylist and image-based fashion analyst.",
    "Respond ONLY with a JSON object matching this exact shape (no markdown fences, no extra text):",
    "{",
    '  "summary": string,   // concise markdown profile, 200 words MAX',
    '  "queries": {         // realistic shopping search queries a person would type into Google Shopping',
    '    "tops": string,',
    '    "bottoms": string,',
    '    "shoes": string,',
    '    "outerwear": string',
    "  }",
    "}",
    "",
    "Rules for `summary` (this is shown to the user, keep it tight — 200 words MAX):",
    "- Use exactly these three markdown sections: '## Style Identity' (2-3 sentences), '## Color Palette' (short bullet list), '## Outfit Formulas' (3-4 concrete looks as a bullet list).",
    "- Do NOT include any other sections. Do NOT include shopping keywords or fabric analysis.",
    "",
    "Rules for `queries` (these are sent verbatim to a product search engine, the user never sees them):",
    "- One specific search string per category, capturing the concrete aesthetic of the inspiration (e.g. team, colorway, garment type, fit).",
    "- Keep each query 4-8 words, no punctuation, written like a real shopper's search. Include 'mens' where appropriate.",
    "",
    "Priority of signals:",
    "- The user's selected style and written notes are the authoritative style direction. The images are supporting visual cues.",
    "- When an image clearly conflicts with the stated style or notes, follow the stated style/notes.",
    "- When the user gives little or no written direction, lean on the images for the aesthetic.",
    "- The user message describes each image's role (portrait vs. reference) and how to weigh them — follow that guidance exactly.",
  ].join("\n");

const generateWithOpenAI = async (input: StyleDescriptionInput, imageDataUrls: string[]) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildSystemInstruction() }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: buildPrompt(input) },
            ...imageDataUrls.map((dataUrl) => ({
              type: "input_image" as const,
              image_url: dataUrl,
            })),
          ],
        },
      ],
      temperature: 0.7,
      max_output_tokens: 1200,
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    throw new Error(await getProviderErrorMessage(response, "OpenAI"));
  }

  const data = (await response.json()) as unknown;
  const raw = getOutputText(data).trim();

  if (!raw) {
    throw new Error("The model returned an empty style description.");
  }

  return parseProfileJson(raw);
};

const generateWithOllama = async (input: StyleDescriptionInput, base64Images: string[]) => {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
      system: buildSystemInstruction(),
      prompt: buildPrompt(input),
      images: base64Images,
      format: "json",
      stream: false,
    }),
  }).catch(() => {
    throw new Error(
      "Could not reach Ollama. Make sure Ollama is running locally on http://localhost:11434.",
    );
  });

  if (!response.ok) {
    throw new Error(await getProviderErrorMessage(response, "Ollama"));
  }

  const data = (await response.json()) as unknown;
  const raw = getOllamaText(data).trim();

  if (!raw) {
    throw new Error("The Ollama model returned an empty style description.");
  }

  return parseProfileJson(raw);
};

const generateWithGemini = async (
  input: StyleDescriptionInput,
  images: Array<{ mimeType: string; base64: string }>,
) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  const model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const response = await fetch(`${GEMINI_API_URL}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: buildSystemInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(input) },
            ...images.map(({ mimeType, base64 }) => ({
              inline_data: {
                mime_type: mimeType,
                data: base64,
              },
            })),
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  }).catch(() => {
    throw new Error("Could not reach Gemini. Check your internet connection and Gemini API key.");
  });

  if (!response.ok) {
    throw new Error(await getProviderErrorMessage(response, "Gemini"));
  }

  const data = (await response.json()) as unknown;
  const raw = getGeminiText(data).trim();

  if (!raw) {
    throw new Error("The Gemini model returned an empty style description.");
  }

  return parseProfileJson(raw);
};

export async function generateStyleDescription(input: StyleDescriptionInput) {
  const provider = (process.env.LLM_PROVIDER ?? "ollama").trim().toLowerCase();

  // Order images deterministically: portrait first (if any), then reference
  // photos — so the prompt can label each image's role with certainty. Reference
  // photos exclude the portrait to avoid sending it twice.
  const referenceUrls = input.inspirationImageUrls.filter((url) => url !== input.portraitUrl);
  const orderedUrls = [
    ...(input.portraitUrl ? [input.portraitUrl] : []),
    ...referenceUrls,
  ];

  const promptInput: StyleDescriptionInput = {
    ...input,
    inspirationImageUrls: orderedUrls,
  };

  const images = await Promise.all(orderedUrls.map((url) => readUploadedImage(url)));

  if (provider === "openai") {
    const imageDataUrls = images.map(({ mimeType, base64 }) => `data:${mimeType};base64,${base64}`);
    return generateWithOpenAI(promptInput, imageDataUrls);
  }

  if (provider === "gemini") {
    return generateWithGemini(promptInput, images);
  }

  return generateWithOllama(
    promptInput,
    images.map(({ base64 }) => base64),
  );
}
