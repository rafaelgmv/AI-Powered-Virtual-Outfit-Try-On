export type Product = {
  id: string;
  title: string;
  price: string;
  priceRaw: number;
  store: string;
  link: string;
  image: string;
  rating?: number;
  reviews?: number;
  category: string;
};

type SerpApiItem = {
  title?: string;
  price?: string;
  extracted_price?: number;
  source?: string;
  link?: string;
  product_link?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
};

type SerpApiResponse = {
  shopping_results?: SerpApiItem[];
};

export type CategoryQueries = {
  tops: string;
  bottoms: string;
  shoes: string;
  outerwear: string;
};

const SERPAPI_URL = "https://serpapi.com/search";

function buildQueries(
  queries: CategoryQueries,
  style: string,
  sizes: { top: string; pants: string; shoes: string },
) {
  // Use the AI-generated query verbatim; fall back to the radio-button style if a query is missing.
  const tops = queries.tops || `${style} mens top`;
  const bottoms = queries.bottoms || `${style} mens pants`;
  const shoes = queries.shoes || `${style} mens sneakers`;
  const outerwear = queries.outerwear || `${style} mens jacket`;

  const topSizeStr = sizes.top ? ` size ${sizes.top}` : "";
  const pantsSizeStr = sizes.pants ? ` waist ${sizes.pants}` : "";
  const shoesSizeStr = sizes.shoes ? ` EU ${sizes.shoes}` : "";

  return [
    { query: `${tops}${topSizeStr}`, category: "Tops" },
    { query: `${bottoms}${pantsSizeStr}`, category: "Bottoms" },
    { query: `${shoes}${shoesSizeStr}`, category: "Shoes" },
    { query: `${outerwear}${topSizeStr}`, category: "Outerwear" },
  ];
}

async function fetchCategory(query: string, category: string, apiKey: string): Promise<Product[]> {
  const url = new URL(SERPAPI_URL);
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", "8");
  url.searchParams.set("gl", "us");
  url.searchParams.set("hl", "en");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SerpAPI ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as SerpApiResponse;

  return (data.shopping_results ?? []).slice(0, 5).map((item, i) => ({
    id: `${category}-${i}-${Date.now()}`,
    title: item.title ?? "Unknown Product",
    price: item.price ?? "—",
    priceRaw: item.extracted_price ?? 0,
    store: item.source ?? "Unknown Store",
    link: item.product_link ?? item.link ?? "#",
    image: item.thumbnail ?? "",
    rating: item.rating,
    reviews: item.reviews,
    category,
  }));
}

// Smoothing constant: how many reviews it takes for a product's own rating
// to outweigh the batch average. Higher = more skeptical of low-review items.
const BAYESIAN_MIN_REVIEWS = 20;

// Sort the whole pool once by a review-weighted (Bayesian) rating so that a
// 5★/2-review reseller can't outrank a 4.4★/12k-review retailer. Rated items
// rank by score (desc); unrated items keep their order and fall to the end.
function rankByRating(products: Product[]): Product[] {
  const rated = products.filter((p) => typeof p.rating === "number" && p.rating > 0);
  const unrated = products.filter((p) => !(typeof p.rating === "number" && p.rating > 0));

  if (rated.length === 0) return products;

  const C = rated.reduce((sum, p) => sum + (p.rating ?? 0), 0) / rated.length;
  const m = BAYESIAN_MIN_REVIEWS;

  const score = (p: Product) => {
    const R = p.rating ?? 0;
    const v = p.reviews ?? 0;
    return (v / (v + m)) * R + (m / (v + m)) * C;
  };

  const sortedRated = [...rated].sort((a, b) => score(b) - score(a));
  return [...sortedRated, ...unrated];
}

export async function searchClothes(
  categoryQueries: CategoryQueries,
  userStyle: string,
  sizes: { top: string; pants: string; shoes: string },
): Promise<Product[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY is not configured. Add it to your .env file.");

  const queries = buildQueries(categoryQueries, userStyle, sizes);

  const settled = await Promise.allSettled(
    queries.map(({ query, category }) => fetchCategory(query, category, apiKey)),
  );

  const errors = settled.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason as Error);
  const seen = new Set<string>();
  const products: Product[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const p of result.value) {
      const key = p.title.toLowerCase().slice(0, 45);
      if (!seen.has(key)) {
        seen.add(key);
        products.push(p);
      }
    }
  }

  if (products.length === 0 && errors.length > 0) {
    throw new Error(errors[0].message);
  }

  return rankByRating(products);
}
