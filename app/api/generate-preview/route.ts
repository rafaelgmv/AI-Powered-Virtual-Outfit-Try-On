import { NextResponse } from "next/server";
import { generateAvatarImages, type OutfitItem } from "../../../lib/avatarGeneration";

export const runtime = "nodejs";

type RequestBody = {
  portraitUrl?: string;
  height?: string;
  weight?: string;
  bodyType?: string;
  outfit?: OutfitItem[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const portraitUrl = body.portraitUrl?.trim() ?? "";
    const outfit = Array.isArray(body.outfit) ? body.outfit : [];

    if (!portraitUrl) {
      return NextResponse.json({ error: "A portrait is required to generate a preview." }, { status: 400 });
    }
    if (outfit.length === 0) {
      return NextResponse.json({ error: "Select an outfit before generating a preview." }, { status: 400 });
    }

    // CatVTON produces a single front view (upper + lower passes). The side
    // slot stays a placeholder — the model can't generate a new pose.
    const { front } = await generateAvatarImages({
      portraitUrl,
      height: body.height?.trim() ?? "",
      weight: body.weight?.trim() ?? "",
      bodyType: body.bodyType?.trim() ?? "",
      outfit,
    });

    return NextResponse.json({ front: front.dataUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
