"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import StyleForm, { type UserSizes, type CategoryQueries, type UserBuild } from "../components/StyleForm";
import ClothingResults, { type OutfitSelection } from "../components/ClothingResults";
import photoOne from "../public/photo2.jpeg";
import photoTwo from "../public/photo1.avif";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.45, staggerChildren: 0.12 },
  },
} as const;

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
} as const;

export default function HomePage() {
  const [styleDescription, setStyleDescription] = useState("");
  const [userStyle, setUserStyle] = useState("");
  const [userSizes, setUserSizes] = useState<UserSizes>({ top: "", pants: "", shoes: "" });
  const [queries, setQueries] = useState<CategoryQueries>({ tops: "", bottoms: "", shoes: "", outerwear: "" });
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitLabel, setPortraitLabel] = useState<string | null>(null);
  const [userBuild, setUserBuild] = useState<UserBuild>({ height: "", weight: "", bodyType: "" });
  const [previewImages, setPreviewImages] = useState<{ front: string } | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const shopRef = useRef<HTMLElement | null>(null);

  const handlePortraitChange = (url: string | null, label?: string | null) => {
    setPortraitUrl(url);
    setPortraitLabel(label ?? null);
  };

  // Clear all generated output (style profile, shop results, try-on preview) when
  // the user starts over.
  const handleReset = () => {
    setStyleDescription("");
    setUserStyle("");
    setQueries({ tops: "", bottoms: "", shoes: "", outerwear: "" });
    setUserBuild({ height: "", weight: "", bodyType: "" });
    setPreviewImages(null);
    setPreviewError("");
  };

  const handleGenerateOutfit = async (outfit: OutfitSelection[]) => {
    if (!portraitUrl) return;
    setGeneratingPreview(true);
    setPreviewError("");
    setPreviewImages(null);
    try {
      const response = await fetch("/api/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portraitUrl, ...userBuild, outfit }),
      });
      const data = (await response.json()) as { front?: string; error?: string };
      if (!response.ok || !data.front) {
        throw new Error(data.error ?? "Could not generate preview.");
      }
      setPreviewImages({ front: data.front });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Could not generate preview.");
    } finally {
      setGeneratingPreview(false);
    }
  };

  const scrollToShop = () => {
    shopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleStyleGenerated = (
    description: string,
    style: string,
    sizes: UserSizes,
    categoryQueries: CategoryQueries,
    build: UserBuild,
  ) => {
    setStyleDescription(description);
    setUserStyle(style);
    setUserSizes(sizes);
    setQueries(categoryQueries);
    setUserBuild(build);
    setPreviewImages(null);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.2),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.2),transparent_35%)]" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-24 pt-16 md:px-10"
      >
        {/* Brand title */}
        <motion.div variants={item} className="text-center">
          <h1 className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text pb-2 text-3xl font-bold leading-relaxed tracking-tight text-transparent md:text-5xl">
            Personalized Styling AI
          </h1>
        </motion.div>

        {/* Hero */}
        <motion.section variants={item} className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-3xl space-y-6">
            <h2 className="text-4xl font-semibold leading-[1.1] md:text-6xl">
              Want to see if an outfit looks good on you?
              <span className="mt-2 block">Try it here!</span>
            </h2>
            <p className="max-w-2xl text-base text-zinc-400 md:text-lg">
              We find your perfect fit. See it on you before buying.
            </p>
          </div>

          <div className="relative mx-auto flex w-full max-w-md items-center justify-center gap-4 lg:justify-end">
            <motion.div
              animate={{ y: [0, -14, 0], rotate: [-2, 1, -2] }}
              transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
              className="w-40 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/60 shadow-2xl shadow-black/30 md:w-44"
            >
              <Image src={photoTwo} alt="Outfit inspiration one" className="h-auto w-full object-cover" priority />
            </motion.div>

            <motion.div
              animate={{ y: [0, 12, 0], rotate: [2, -1, 2] }}
              transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              className="mt-10 w-36 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/60 shadow-2xl shadow-black/30 md:w-40"
            >
              <Image src={photoOne} alt="Outfit inspiration two" className="h-auto w-full object-cover" />
            </motion.div>
          </div>
        </motion.section>

        {/* Form + Avatar */}
        <motion.section variants={item} className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <StyleForm onStyleGenerated={handleStyleGenerated} onPortraitChange={handlePortraitChange} onContinueToShop={scrollToShop} onReset={handleReset} />

          <div className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl md:p-8">
            <p className="mb-4 text-sm text-zinc-400">Avatar Preview</p>
            <div className="relative grid min-h-[460px] flex-1 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.12),transparent_55%)]" />
              {portraitUrl ? (
                <div className="relative flex w-full flex-col items-center gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={portraitUrl}
                      alt={portraitLabel ?? "User portrait"}
                      className="h-72 w-52 rounded-[2rem] border border-white/15 object-cover shadow-2xl shadow-black/40"
                    />
                    <div className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                      {styleDescription ? "Portrait" : portraitLabel ?? "Your portrait"}
                    </div>
                  </div>

                  {/* Generated try-on slots — appear once a profile exists */}
                  {styleDescription && (
                    <div className="flex w-full flex-col gap-4">
                      {([
                        { label: "Front view", src: previewImages?.front, pulses: generatingPreview },
                        { label: "Side view", src: undefined, pulses: false },
                      ] as const).map(({ label, src, pulses }) => (
                        <div key={label} className="flex flex-col items-center gap-2">
                          {src ? (
                            <img
                              src={src}
                              alt={label}
                              className="h-72 w-52 rounded-[2rem] border border-white/15 object-cover shadow-2xl shadow-black/40"
                            />
                          ) : (
                            <motion.div
                              animate={pulses ? { opacity: [0.3, 0.8, 0.3] } : { opacity: 0.5 }}
                              transition={{ repeat: pulses ? Infinity : 0, duration: 1.2, ease: "easeInOut" }}
                              className="grid h-72 w-52 place-items-center rounded-[2rem] border border-dashed border-white/15 bg-white/5"
                            >
                              {pulses && (
                                <span className="text-[11px] uppercase tracking-[0.18em] text-violet-300/80">Generating…</span>
                              )}
                            </motion.div>
                          )}
                          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
                        </div>
                      ))}
                      {previewError && (
                        <p className="text-center text-xs text-red-400">{previewError}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <motion.div
                    animate={{ opacity: [0.4, 0.9, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                    className="h-64 w-44 rounded-[2rem] border border-white/15 bg-white/5"
                  />
                  <div className="absolute bottom-6 text-xs uppercase tracking-[0.22em] text-zinc-500">
                    Waiting for user portrait...
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.section>

        {/* Clothing recommendations — shown after style is generated */}
        {styleDescription && (
          <motion.section
            ref={shopRef}
            variants={item}
            initial="hidden"
            animate="show"
            className="scroll-mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl md:p-10"
          >
            <ClothingResults
              styleDescription={styleDescription}
              userStyle={userStyle}
              sizes={userSizes}
              queries={queries}
              onGenerateOutfit={handleGenerateOutfit}
              generating={generatingPreview}
            />
          </motion.section>
        )}
      </motion.div>
    </main>
  );
}
