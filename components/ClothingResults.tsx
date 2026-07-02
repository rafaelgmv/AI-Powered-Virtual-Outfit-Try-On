"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, Plus, ShoppingBag, Sparkles, Star } from "lucide-react";
import type { Product } from "../lib/clothingSearch";

type CategoryQueries = {
  tops: string;
  bottoms: string;
  shoes: string;
  outerwear: string;
};

export type OutfitSelection = {
  category: string;
  title: string;
  image: string;
};

type Props = {
  styleDescription: string;
  userStyle: string;
  sizes: { top: string; pants: string; shoes: string };
  queries: CategoryQueries;
  onGenerateOutfit?: (outfit: OutfitSelection[]) => void;
  generating?: boolean;
};

const CATEGORIES = ["All", "Tops", "Bottoms", "Shoes", "Outerwear"];

const SEARCH_MESSAGES = [
  "Scanning fashion retailers…",
  "Matching pieces to your aesthetic…",
  "Filtering by style & fit…",
  "Curating the best picks…",
  "Almost ready…",
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
} as const;

export default function ClothingResults({ styleDescription, userStyle, sizes, queries, onGenerateOutfit, generating }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchMsgIndex, setSearchMsgIndex] = useState(0);
  // One selected product id per outfit category (Tops/Bottoms/Shoes/Outerwear).
  const [selected, setSelected] = useState<Record<string, string>>({});
  const msgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleSelect = (product: Product) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[product.category] === product.id) {
        delete next[product.category]; // clicking the selected item deselects it
      } else {
        next[product.category] = product.id;
      }
      return next;
    });
  };

  useEffect(() => {
    if (!styleDescription) return;
    setLoading(true);
    setError("");
    setProducts([]);
    setSelected({});
    setSearchMsgIndex(0);
    msgIntervalRef.current = setInterval(() => {
      setSearchMsgIndex((i) => (i + 1) % SEARCH_MESSAGES.length);
    }, 4500);

    fetch("/api/search-clothes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, userStyle, sizes }),
    })
      .then((r) => r.json())
      .then((data: { products?: Product[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setProducts(data.products ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load products"),
      )
      .finally(() => {
        setLoading(false);
        if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
      });

    return () => { if (msgIntervalRef.current) clearInterval(msgIntervalRef.current); };
  }, [styleDescription, userStyle, sizes, queries]);

  const filtered =
    activeCategory === "All" ? products : products.filter((p) => p.category === activeCategory);

  // The try-on uses an upper (Tops/Outerwear) + a lower (Bottoms). Shoes can't be
  // tried on and aren't selectable; Outerwear is optional. So only Tops + Bottoms
  // are required to generate a preview.
  const REQUIRED_CATEGORIES = ["Tops", "Bottoms"];
  const OUTFIT_CATEGORIES = ["Tops", "Bottoms", "Outerwear"];
  const selectedCount = REQUIRED_CATEGORIES.filter((c) => selected[c]).length;
  const allSelected = selectedCount === REQUIRED_CATEGORIES.length;

  const handleGeneratePreview = () => {
    if (!allSelected) return;
    const outfit = OUTFIT_CATEGORIES.flatMap((c) => {
      const product = products.find((p) => p.id === selected[c]);
      return product ? [{ category: c, title: product.title, image: product.image }] : [];
    });
    onGenerateOutfit?.(outfit);
  };

  if (!styleDescription) return null;

  return (
    <section className="space-y-10 pt-4">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-center"
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Curated for your style
        </motion.span>
        <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Shop Your{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent capitalize">
            {userStyle}
          </span>{" "}
          Look
        </h2>
        <p className="mt-2 text-zinc-400">Hand-picked pieces matching your personal aesthetic</p>
      </motion.div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Category tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-1.5 overflow-x-auto pb-1"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
              activeCategory === cat ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {activeCategory === cat && (
              <motion.span
                layoutId="cat-active"
                className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/80 to-violet-500/80"
                style={{ zIndex: -1 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            {cat}
            {activeCategory !== "All" && cat !== "All" && (
              <span className="ml-1.5 text-xs text-zinc-500">
                ({products.filter((p) => p.category === cat).length})
              </span>
            )}
          </button>
        ))}
      </motion.div>

      {/* Loading animation */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Search status banner */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 px-6 py-5">
              <motion.div
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent"
              />
              <div className="flex items-center gap-4">
                <div className="relative h-9 w-9 shrink-0">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 border-r-violet-400"
                    style={{ display: "block" }}
                  />
                  <motion.span
                    animate={{ rotate: -360 }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-1.5 rounded-full border-2 border-transparent border-b-violet-300"
                    style={{ display: "block" }}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Searching stores</p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={searchMsgIndex}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.3 }}
                      className="mt-0.5 text-sm font-medium text-zinc-200"
                    >
                      {SEARCH_MESSAGES[searchMsgIndex]}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Skeleton cards */}
            <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"
                >
                  <motion.div
                    animate={{ opacity: [0.2, 0.5, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.1, ease: "easeInOut" }}
                    className="aspect-[3/4] bg-gradient-to-br from-white/5 to-white/[0.02]"
                  />
                  <div className="space-y-2.5 p-4">
                    {[0.75, 0.5, 0.35].map((w, j) => (
                      <motion.div
                        key={j}
                        animate={{ opacity: [0.15, 0.4, 0.15] }}
                        transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.1 + j * 0.2 }}
                        className="h-2.5 rounded-full bg-white/10"
                        style={{ width: `${w * 100}%` }}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {error && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-5 text-sm text-red-300"
        >
          <p className="font-medium">Could not load products</p>
          <p className="mt-1 text-red-400/70">{error}</p>
        </motion.div>
      )}

      {/* Products grid */}
      <AnimatePresence mode="popLayout">
        {!loading && filtered.length > 0 && (
          <motion.div
            key={activeCategory}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                selected={selected[product.category] === product.id}
                onSelect={() => toggleSelect(product)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!loading && !error && products.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-16 text-center"
        >
          <ShoppingBag className="h-10 w-10 text-zinc-700" />
          <p className="text-zinc-500">No products found. Try regenerating your style profile.</p>
        </motion.div>
      )}

      {/* Outfit selection + generate preview */}
      {!loading && products.length > 0 && (
        <div className="sticky bottom-4 z-10 rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs uppercase tracking-widest text-zinc-500">Your outfit</span>
              {OUTFIT_CATEGORIES.map((c) => {
                const picked = Boolean(selected[c]);
                const optional = !REQUIRED_CATEGORIES.includes(c);
                return (
                  <span key={c}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${picked ? "border-violet-400/50 bg-violet-500/15 text-violet-200" : "border-white/10 text-zinc-500"}`}>
                    {picked ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-zinc-600" />}
                    {c}{optional && <span className="text-[10px] text-zinc-500">(optional)</span>}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={!allSelected || generating}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {generating
                ? "Generating preview…"
                : allSelected
                  ? "Generate Preview"
                  : `Pick a top & bottom to preview (${selectedCount}/${REQUIRED_CATEGORIES.length})`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ProductCard({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.article
      variants={cardVariants}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white/[0.03] backdrop-blur-sm transition-colors duration-300 ${selected ? "border-violet-400 ring-2 ring-violet-400/40" : "border-white/10 hover:border-violet-500/30"}`}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-900/80">
        {/* Selected check badge */}
        {selected && (
          <div className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-white shadow-lg">
            <Check className="h-4 w-4" />
          </div>
        )}
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag className="h-10 w-10 text-zinc-700" />
          </div>
        )}

        {/* Gradient overlay always present */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Category badge */}
        <div className="absolute left-3 top-3">
          <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300 backdrop-blur-md">
            {product.category}
          </span>
        </div>


        {/* Hover CTA */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 left-0 right-0 p-3"
            >
              <a
                href={product.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Shop Now
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{product.title}</p>
        <p className="mt-1 text-xs text-zinc-500">{product.store}</p>

        {product.rating != null && (
          <div className="mt-1.5 flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs text-zinc-400">
              {product.rating.toFixed(1)}
              {product.reviews ? (
                <span className="text-zinc-600"> ({product.reviews.toLocaleString()})</span>
              ) : null}
            </span>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-base font-bold text-white">{product.price}</span>
          <a
            href={product.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 transition hover:border-violet-400/50 hover:text-violet-300"
            aria-label="Open product"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Select for outfit */}
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
            selected
              ? "border-violet-400 bg-violet-500/20 text-violet-100"
              : "border-white/15 text-zinc-300 hover:border-violet-400/60 hover:text-white"
          }`}
        >
          {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {selected ? "Selected" : "Select"}
        </button>
      </div>
    </motion.article>
  );
}
