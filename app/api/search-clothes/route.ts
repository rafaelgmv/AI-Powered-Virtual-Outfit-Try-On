import { NextResponse } from "next/server";
import { searchClothes, type CategoryQueries } from "../../../lib/clothingSearch";

export const runtime = "nodejs";

type RequestBody = {
  queries?: Partial<CategoryQueries>;
  userStyle?: string;
  sizes?: { top?: string; pants?: string; shoes?: string };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.queries || !body.userStyle) {
      return NextResponse.json({ error: "Missing queries or userStyle." }, { status: 400 });
    }

    const queries: CategoryQueries = {
      tops: body.queries.tops ?? "",
      bottoms: body.queries.bottoms ?? "",
      shoes: body.queries.shoes ?? "",
      outerwear: body.queries.outerwear ?? "",
    };

    const sizes = {
      top: body.sizes?.top ?? "",
      pants: body.sizes?.pants ?? "",
      shoes: body.sizes?.shoes ?? "",
    };

    const products = await searchClothes(queries, body.userStyle, sizes);
    return NextResponse.json({ products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search for clothes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
