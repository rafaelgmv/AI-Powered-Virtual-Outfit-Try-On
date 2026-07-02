import { NextResponse } from "next/server";
import { generateStyleDescription } from "../../../lib/styleDescription";

export const runtime = "nodejs";

type RequestBody = {
  height?: string;
  weight?: string;
  bodyType?: string;
  selectedStyle?: string;
  portraitUrl?: string | null;
  inspirationImageUrls?: string[];
  sizes?: { top?: string; pants?: string; shoes?: string };
  styleNotes?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const height = body.height?.trim() ?? "";
    const weight = body.weight?.trim() ?? "";
    const bodyType = body.bodyType?.trim() ?? "";
    const selectedStyle = body.selectedStyle?.trim() ?? "";
    const portraitUrl = typeof body.portraitUrl === "string" && body.portraitUrl ? body.portraitUrl : null;
    const inspirationImageUrls = Array.isArray(body.inspirationImageUrls) ? body.inspirationImageUrls : [];

    if (!height || !weight || !bodyType || !selectedStyle) {
      return NextResponse.json({ error: "Missing user preferences." }, { status: 400 });
    }

    if (!portraitUrl && inspirationImageUrls.length === 0) {
      return NextResponse.json({ error: "A portrait or at least one reference image is required." }, { status: 400 });
    }

    const sizes = body.sizes
      ? { top: body.sizes.top ?? "", pants: body.sizes.pants ?? "", shoes: body.sizes.shoes ?? "" }
      : undefined;

    const { description, queries } = await generateStyleDescription({
      height,
      weight,
      bodyType,
      selectedStyle,
      portraitUrl,
      inspirationImageUrls,
      sizes,
      styleNotes: body.styleNotes?.trim(),
    });

    return NextResponse.json({ description, queries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate style description.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
