"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { loadProfile, saveProfile, clearProfile, type CachedProfile } from "../lib/profileCache";
import {
  ArrowLeft,
  ArrowRight,
  Dumbbell,
  ImagePlus,
  Pencil,
  PersonStanding,
  Ruler,
  Shirt,
  Footprints,
  X,
} from "lucide-react";

type StyleOption = {
  id: "streetwear" | "casual" | "classic" | "oversized" | "alternative" | "sporty";
  label: string;
  description: string;
};

export type UserSizes = {
  top: string;
  pants: string;
  shoes: string;
};

export type CategoryQueries = {
  tops: string;
  bottoms: string;
  shoes: string;
  outerwear: string;
};

export type UserBuild = {
  height: string;
  weight: string;
  bodyType: string;
};

const styleOptions: StyleOption[] = [
  { id: "streetwear", label: "Streetwear", description: "Urban, bold, and modern" },
  { id: "casual", label: "Casual", description: "Comfortable for everyday wear" },
  { id: "classic", label: "Classic", description: "Timeless and elegant" },
  { id: "oversized", label: "Oversized", description: "Loose and creative silhouette" },
  { id: "alternative", label: "Alternative", description: "Unique, bold, and inspired by underground culture" },
  { id: "sporty", label: "Sporty", description: "Performance-inspired and active look" },
];

const topSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const pantsSizes = ["28", "30", "32", "34", "36", "38", "40"];
const shoesSizes = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"];
const MAX_REFERENCE_IMAGES = 2;

// Preset portraits for users who prefer not to upload a photo. Defined entirely
// by /public/presets/presets.csv (columns: file,ethnicity,gender,name,height,weight,bodyType)
// so adding a preset is just dropping an image and adding a row — no code changes.
// height/weight/bodyType are the model's build; selecting a preset auto-fills and
// locks those fields (clothing sizes stay user-controlled).
type PortraitPreset = {
  id: string;
  category: string;
  name: string;
  url: string;
  height: string;
  weight: string;
  bodyType: string;
};

const parsePresetsCsv = (csv: string): PortraitPreset[] => {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Drop the header row if present.
  const rows = /file\s*,/i.test(lines[0]) ? lines.slice(1) : lines;

  return rows
    .map((line) => {
      const [file, ethnicity, gender, name, height, weight, bodyType] = line
        .split(",")
        .map((c) => c.trim());
      if (!file) return null;
      return {
        id: file,
        category: [ethnicity, gender].filter(Boolean).join(" · "),
        name: name ?? "",
        url: `/presets/${file}`,
        height: height ?? "",
        weight: weight ?? "",
        bodyType: bodyType ?? "",
      };
    })
    .filter((p): p is PortraitPreset => p !== null);
};

const LOADING_MESSAGES = [
  "Analyzing your inspiration images…",
  "Building your color palette…",
  "Crafting outfit formulas…",
  "Curating your shopping keywords…",
  "Finalizing your style profile…",
];

const stepVariants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut", staggerChildren: 0.08 },
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: "easeIn" } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
} as const;

type Props = {
  onStyleGenerated?: (
    description: string,
    style: string,
    sizes: UserSizes,
    queries: CategoryQueries,
    build: UserBuild,
  ) => void;
  onPortraitChange?: (portraitUrl: string | null, label?: string | null) => void;
  onContinueToShop?: () => void;
  onReset?: () => void;
};

export default function StyleForm({ onStyleGenerated, onPortraitChange, onContinueToShop, onReset }: Props) {
  const bodyTypeOptions = ["Athletic", "Slim", "Average", "Muscular", "Curvy", "Petite", "Plus Size"];

  const [step, setStep] = useState(1);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [topSize, setTopSize] = useState("");
  const [pantsSize, setPantsSize] = useState("");
  const [shoesSize, setShoesSize] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<StyleOption["id"] | null>(null);
  const [styleNotes, setStyleNotes] = useState("");
  const [imageNames, setImageNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [portraitName, setPortraitName] = useState("");
  const [portraitUploading, setPortraitUploading] = useState(false);
  const [portraitError, setPortraitError] = useState("");
  const [portraitMode, setPortraitMode] = useState<"upload" | "preset">("upload");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [portraitPresets, setPortraitPresets] = useState<PortraitPreset[]>([]);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  // When a preset auto-fills the build fields, stash the user's typed values so
  // they can be restored on deselect. null = no preset currently overriding.
  const stashedBuildRef = useRef<{ height: string; weight: string; bodyType: string } | null>(null);
  const buildLockedByPreset = selectedPreset !== null && stashedBuildRef.current !== null;
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [hasCachedProfile, setHasCachedProfile] = useState(false);
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  const queriesRef = useRef<CategoryQueries>({ tops: "", bottoms: "", shoes: "", outerwear: "" });
  const lastGeneratedRequestRef = useRef("");

  // Cycle loading messages
  useEffect(() => {
    if (!generatingDescription) return;
    setLoadingMsgIndex(0);
    const id = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 4500);
    return () => clearInterval(id);
  }, [generatingDescription]);

  // Load preset portraits from the CSV at runtime.
  useEffect(() => {
    let active = true;
    fetch("/presets/presets.csv")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Failed to load presets"))))
      .then((csv) => { if (active) setPortraitPresets(parsePresetsCsv(csv)); })
      .catch(() => { if (active) setPortraitPresets([]); });
    return () => { active = false; };
  }, []);

  // Restore a cached profile (returning visitor) once, on mount. Re-fills every
  // field, lifts portrait/style/queries to the parent, and lands on step 2 so the
  // user can tweak notes/photos and regenerate without redoing step 1.
  useEffect(() => {
    const cached = loadProfile();
    if (!cached) return;

    setHeight(cached.height);
    setWeight(cached.weight);
    setBodyType(cached.bodyType);
    setTopSize(cached.topSize);
    setPantsSize(cached.pantsSize);
    setShoesSize(cached.shoesSize);
    setPortraitMode(cached.portraitMode);
    setSelectedPreset(cached.selectedPreset);
    setPortraitUrl(cached.portraitUrl);
    if (cached.portraitUrl) setPortraitName(cached.portraitLabel ?? "Your portrait");
    setSelectedStyle((cached.selectedStyle as StyleOption["id"] | null) ?? null);
    setStyleNotes(cached.styleNotes);
    setUploadedImageUrls(cached.uploadedImageUrls);
    setImageNames(cached.imageNames);
    setGeneratedDescription(cached.generatedDescription);
    queriesRef.current = cached.queries;

    // Hand the restored portrait + style result back up to the page.
    onPortraitChange?.(cached.portraitUrl, cached.portraitLabel);
    if (cached.generatedDescription && cached.selectedStyle) {
      onStyleGenerated?.(
        cached.generatedDescription,
        cached.selectedStyle,
        { top: cached.topSize, pants: cached.pantsSize, shoes: cached.shoesSize },
        cached.queries,
        { height: cached.height, weight: cached.weight, bodyType: cached.bodyType },
      );
    }

    setHasCachedProfile(true);
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPortrait = Boolean(portraitName) || Boolean(selectedPreset);

  const canContinue = useMemo(() => {
    if (step === 1) return Boolean(height.trim() && weight.trim() && bodyType.trim() && hasPortrait);
    if (step === 2) return Boolean(selectedStyle);
    return true;
  }, [step, height, weight, bodyType, selectedStyle, hasPortrait]);

  const nextStep = () => { if (step < 3 && canContinue) setStep((p) => p + 1); };
  const prevStep = () => { if (step > 1) setStep((p) => p - 1); };

  // Upload reference photos and APPEND them to the existing set (capped at
  // MAX_REFERENCE_IMAGES), so the user can add more without losing what's there.
  const handleFileUpload = async (files: File[]) => {
    const remaining = MAX_REFERENCE_IMAGES - uploadedImageUrls.length;
    if (remaining <= 0) {
      setUploadError(`You can add up to ${MAX_REFERENCE_IMAGES} photos.`);
      return;
    }
    const accepted = files.slice(0, remaining);

    setUploading(true);
    setUploadError("");
    lastGeneratedRequestRef.current = "";
    const formData = new FormData();
    for (const file of accepted) formData.append("file", file);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed");
      const data = (await response.json()) as { fileUrls: string[] };
      setImageNames((prev) => [...prev, ...accepted.map((f) => f.name)]);
      setUploadedImageUrls((prev) => [...prev, ...data.fileUrls]);
      setGenerationError("");
    } catch {
      setUploadError("Could not upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Remove one reference image from the set (by index).
  const removeReferenceImage = (index: number) => {
    setUploadedImageUrls((prev) => prev.filter((_, i) => i !== index));
    setImageNames((prev) => prev.filter((_, i) => i !== index));
    lastGeneratedRequestRef.current = "";
  };

  const handlePortraitUpload = async (file: File) => {
    setPortraitUploading(true);
    setPortraitError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed");
      const data = (await response.json()) as { fileUrls: string[] };
      const url = data.fileUrls[0] ?? null;
      setPortraitName(file.name);
      setPortrait(url, "Your portrait");
    } catch {
      setPortraitError("Could not upload portrait. Please try again.");
      setPortraitName("");
      setPortrait(null);
    } finally {
      setPortraitUploading(false);
    }
  };

  // Single point of truth for the portrait: keep local state (for sending to the
  // AI) and the parent (for the avatar preview) in sync.
  const setPortrait = (url: string | null, label?: string | null) => {
    setPortraitUrl(url);
    onPortraitChange?.(url, label);
  };

  // Restore the user's typed build values that a preset had overridden.
  const restoreBuild = () => {
    const stashed = stashedBuildRef.current;
    if (!stashed) return;
    setHeight(stashed.height);
    setWeight(stashed.weight);
    setBodyType(stashed.bodyType);
    stashedBuildRef.current = null;
  };

  const selectPreset = (preset: PortraitPreset) => {
    // Choosing a preset replaces any uploaded portrait.
    setPortraitName("");
    setPortraitError("");

    // If the preset carries build data, stash the user's current values (only on
    // the first preset selection) and apply the preset's build, locking the fields.
    const hasBuild = Boolean(preset.height || preset.weight || preset.bodyType);
    if (hasBuild) {
      if (!stashedBuildRef.current) {
        stashedBuildRef.current = { height, weight, bodyType };
      }
      setHeight(preset.height);
      setWeight(preset.weight);
      setBodyType(preset.bodyType);
    } else {
      // Preset has no build data — make sure any prior lock is released.
      restoreBuild();
    }

    setSelectedPreset(preset.id);
    setPortrait(preset.url, preset.name || "Your portrait");
  };

  const deselectPreset = () => {
    restoreBuild();
    setSelectedPreset(null);
    setPortrait(null);
  };

  const switchPortraitMode = (mode: "upload" | "preset") => {
    if (mode === portraitMode) return;
    // Clear the previous source so the two tabs don't conflict, and release any
    // preset-imposed lock on the build fields.
    restoreBuild();
    setPortraitMode(mode);
    setPortraitName("");
    setPortraitError("");
    setSelectedPreset(null);
    setPortrait(null);
  };

  const handleGenerateStyleDescription = async () => {
    if (!selectedStyle) { setGenerationError("Please choose a style first."); return; }

    // Portrait (mandatory) and reference photos (optional) are sent as separate
    // fields so the AI knows each image's role: portrait = the person, references
    // = style inspiration. The backend orders portrait-first and labels them.
    if (!portraitUrl && uploadedImageUrls.length === 0) { setGenerationError("Add a portrait first."); return; }

    const requestPayload = {
      height: height.trim(),
      weight: weight.trim(),
      bodyType: bodyType.trim(),
      sizes: { top: topSize, pants: pantsSize, shoes: shoesSize },
      selectedStyle,
      styleNotes: styleNotes.trim(),
      portraitUrl,
      inspirationImageUrls: uploadedImageUrls,
    };
    const sig = JSON.stringify(requestPayload);
    if (sig === lastGeneratedRequestRef.current && generatedDescription) { setGenerationError(""); return; }

    setGeneratingDescription(true);
    setGenerationError("");
    setGeneratedDescription("");

    try {
      const response = await fetch("/api/style-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const data = (await response.json()) as {
        description?: string;
        queries?: CategoryQueries;
        error?: string;
      };
      if (!response.ok || !data.description) throw new Error(data.error ?? "Could not generate style description.");
      const queries = data.queries ?? { tops: "", bottoms: "", shoes: "", outerwear: "" };
      lastGeneratedRequestRef.current = sig;
      queriesRef.current = queries;
      setGeneratedDescription(data.description);
      onStyleGenerated?.(data.description, selectedStyle, { top: topSize, pants: pantsSize, shoes: shoesSize }, queries, { height: height.trim(), weight: weight.trim(), bodyType: bodyType.trim() });

      // Persist the full profile so a return visit skips the cold start.
      const profile: CachedProfile = {
        height: height.trim(),
        weight: weight.trim(),
        bodyType: bodyType.trim(),
        topSize,
        pantsSize,
        shoesSize,
        portraitUrl,
        portraitLabel: portraitName || null,
        portraitMode,
        selectedPreset,
        selectedStyle,
        styleNotes: styleNotes.trim(),
        uploadedImageUrls,
        imageNames,
        generatedDescription: data.description,
        queries,
      };
      saveProfile(profile);
      setHasCachedProfile(true);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Could not generate style description.");
    } finally {
      setGeneratingDescription(false);
    }
  };

  // Wipe the cached profile and reset every field for a clean run.
  const handleStartOver = () => {
    clearProfile();
    setHasCachedProfile(false);
    setConfirmingStartOver(false);
    setHeight(""); setWeight(""); setBodyType("");
    setTopSize(""); setPantsSize(""); setShoesSize("");
    setSelectedStyle(null); setStyleNotes("");
    setImageNames([]); setUploadedImageUrls([]); setUploadError("");
    setPortraitName(""); setPortraitError(""); setPortraitMode("upload");
    setSelectedPreset(null); setPortraitUrl(null);
    stashedBuildRef.current = null;
    setGeneratedDescription(""); setGenerationError("");
    queriesRef.current = { tops: "", bottoms: "", shoes: "", outerwear: "" };
    lastGeneratedRequestRef.current = "";
    onPortraitChange?.(null);
    onReset?.();
    setStep(1);
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-400">Step {step} of 3</p>
          {hasCachedProfile && (
            confirmingStartOver ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleStartOver}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
                  Confirm
                </button>
                <button type="button" onClick={() => setConfirmingStartOver(false)}
                  className="rounded-xl border border-white/15 px-3 py-2 text-sm text-zinc-300 transition hover:border-white/30">
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmingStartOver(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
                Start over
              </button>
            )
          )}
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <span key={s} className={`h-1.5 w-10 rounded-full transition-colors duration-300 ${s <= step ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-white/10"}`} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step-1" variants={stepVariants} initial="hidden" animate="show" exit="exit" className="space-y-4">
            <motion.h3 variants={itemVariants} className="text-xl font-semibold text-white">Physical Data</motion.h3>
            <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm text-zinc-300"><Ruler className="h-4 w-4" />Height (cm)</span>
                <input value={height} onChange={(e) => setHeight(e.target.value)} disabled={buildLockedByPreset} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50" placeholder="175" />
              </label>
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm text-zinc-300"><Dumbbell className="h-4 w-4" />Weight (kg)</span>
                <input value={weight} onChange={(e) => setWeight(e.target.value)} disabled={buildLockedByPreset} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50" placeholder="70" />
              </label>
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm text-zinc-300"><PersonStanding className="h-4 w-4" />Body Type</span>
                <select value={bodyType} onChange={(e) => setBodyType(e.target.value)} disabled={buildLockedByPreset} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50">
                  <option value="" className="bg-zinc-900 text-zinc-400">Select body type</option>
                  {bodyTypeOptions.map((o) => <option key={o} value={o} className="bg-zinc-900 text-white">{o}</option>)}
                </select>
              </label>
            </motion.div>
            {buildLockedByPreset && (
              <motion.p variants={itemVariants} className="text-xs text-violet-300/80">
                Build set by the chosen preset. Deselect the preset (or switch to Upload) to edit these.
              </motion.p>
            )}
            <motion.div variants={itemVariants}>
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Shirt className="h-4 w-4 text-violet-400" />
                Clothing Sizes
                <span className="text-xs font-normal text-zinc-500">(optional)</span>
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-zinc-400">Top Size</span>
                  <select value={topSize} onChange={(e) => setTopSize(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-violet-400">
                    <option value="" className="bg-zinc-900 text-zinc-400">Any</option>
                    {topSizes.map((s) => <option key={s} value={s} className="bg-zinc-900 text-white">{s}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-zinc-400">Pants Waist (in)</span>
                  <select value={pantsSize} onChange={(e) => setPantsSize(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-violet-400">
                    <option value="" className="bg-zinc-900 text-zinc-400">Any</option>
                    {pantsSizes.map((s) => <option key={s} value={s} className="bg-zinc-900 text-white">{s}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="flex items-center gap-1.5 text-sm text-zinc-400"><Footprints className="h-3.5 w-3.5" />Shoes Size (EU)</span>
                  <select value={shoesSize} onChange={(e) => setShoesSize(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-violet-400">
                    <option value="" className="bg-zinc-900 text-zinc-400">Any</option>
                    {shoesSizes.map((s) => <option key={s} value={s} className="bg-zinc-900 text-white">{s}</option>)}
                  </select>
                </label>
              </div>
            </motion.div>

            {/* Portrait: upload or pick a preset */}
            <motion.div variants={itemVariants}>
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <PersonStanding className="h-4 w-4 text-violet-400" />
                Portrait
              </p>

              {/* Tabs */}
              <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
                <button type="button" onClick={() => switchPortraitMode("upload")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${portraitMode === "upload" ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                  Upload
                </button>
                <button type="button" onClick={() => switchPortraitMode("preset")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${portraitMode === "preset" ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                  Choose Preset
                </button>
              </div>

              {portraitMode === "upload" ? (
                <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-black/20 p-4 text-center transition hover:border-violet-400/70">
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) { setPortraitName(""); setPortraitError(""); setPortrait(null); return; }
                      void handlePortraitUpload(file);
                    }} />
                  <ImagePlus className="h-5 w-5 text-violet-300" />
                  <p className="text-sm text-white">Upload a portrait to preview your look</p>
                  <p className="text-xs text-zinc-400">
                    {portraitUploading ? "Uploading…" : portraitName ? portraitName : "Accepted Formats: JPG, PNG, WEBP"}
                  </p>
                  {portraitError && <p className="text-xs text-red-400">{portraitError}</p>}
                </label>
              ) : portraitPresets.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-500">Loading presets…</p>
              ) : (
                <div className="dark-scroll grid max-h-[19rem] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
                  {portraitPresets.map((preset) => (
                    <button key={preset.id} type="button"
                      onClick={() => (selectedPreset === preset.id ? deselectPreset() : selectPreset(preset))}
                      title={`${preset.category} — ${preset.name}`}
                      className={`group overflow-hidden rounded-xl border text-left transition ${selectedPreset === preset.id ? "border-violet-400 ring-2 ring-violet-400/40" : "border-white/10 hover:border-white/25"}`}>
                      <img src={preset.url} alt={preset.name} className="aspect-[3/4] w-full bg-zinc-900/60 object-cover" />
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-violet-300/80">{preset.category}</p>
                        <p className="truncate text-xs font-medium text-zinc-200">{preset.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!hasPortrait && (
                <p className="mt-2 text-xs text-zinc-500">Upload a portrait or choose a preset to continue.</p>
              )}
            </motion.div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step-2" variants={stepVariants} initial="hidden" animate="show" exit="exit" className="space-y-5">
            <motion.h3 variants={itemVariants} className="text-xl font-semibold text-white">Choose your style</motion.h3>
            <motion.div variants={itemVariants} className="grid gap-3 md:grid-cols-2">
              {styleOptions.map((style) => (
                <button key={style.id} type="button" onClick={() => setSelectedStyle(style.id)}
                  className={`rounded-2xl border p-4 text-left transition ${selectedStyle === style.id ? "border-violet-400 bg-violet-500/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}>
                  <p className="mb-1 flex items-center gap-2 text-base font-medium text-white"><Shirt className="h-4 w-4" />{style.label}</p>
                  <p className="text-sm text-zinc-400">{style.description}</p>
                </button>
              ))}
            </motion.div>

            {/* Style notes */}
            <motion.div variants={itemVariants} className="space-y-2">
              <label htmlFor="style-notes" className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Pencil className="h-4 w-4 text-violet-400" />
                Describe your style in your own words
                <span className="text-xs font-normal text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="style-notes"
                value={styleNotes}
                onChange={(e) => setStyleNotes(e.target.value)}
                rows={3}
                placeholder="e.g. I like clean minimal fits with earthy tones, baggy jeans and vintage tees…"
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-violet-400"
              />
            </motion.div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step-3" variants={stepVariants} initial="hidden" animate="show" exit="exit" className="space-y-4">
            <motion.h3 variants={itemVariants} className="flex items-center gap-2 text-xl font-semibold text-white">
              Reference Photos
              <span className="text-xs font-normal text-zinc-500">(optional)</span>
            </motion.h3>
            <motion.p variants={itemVariants} className="text-sm text-zinc-400">
              Add up to two photos of looks you want to sharpen the result. If not, we&apos;ll style from your portrait, selected style, and notes.
            </motion.p>
            <motion.div variants={itemVariants}>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {/* Uploaded reference images, each removable */}
                {uploadedImageUrls.map((url, i) => (
                  <div key={url} className="group relative overflow-hidden rounded-xl border border-white/10">
                    <img src={url} alt={imageNames[i] ?? "Reference"} className="aspect-square w-full bg-zinc-900/60 object-cover" />
                    <button type="button" onClick={() => removeReferenceImage(i)}
                      aria-label="Remove image"
                      className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-zinc-200 backdrop-blur transition hover:bg-red-500/80 hover:text-white">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add-more tile — hidden once the cap is reached */}
                {uploadedImageUrls.length < MAX_REFERENCE_IMAGES && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-black/20 p-2 text-center transition hover:border-violet-400/70">
                    <input type="file" multiple accept="image/*" className="hidden"
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        if (files.length > 0) void handleFileUpload(files);
                        e.target.value = ""; // allow re-selecting the same file
                      }} />
                    <ImagePlus className="h-5 w-5 text-violet-300" />
                    <span className="text-[11px] text-zinc-400">
                      {uploading ? "Uploading…" : uploadedImageUrls.length > 0 ? "Add more" : "Add photos"}
                    </span>
                  </label>
                )}
              </div>
              {uploadError && <p className="mt-2 text-xs text-red-400">{uploadError}</p>}
              <p className="mt-2 text-xs text-zinc-500">Supported Formats: JPG, PNG, WEBP</p>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-3">
              <button type="button" onClick={handleGenerateStyleDescription}
                disabled={uploading || generatingDescription || !portraitUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {generatingDescription
                  ? "Analyzing style…"
                  : generatedDescription
                    ? "Regenerate"
                    : "Generate Full Style Description"}
              </button>

              {generationError && <p className="text-sm text-red-400">{generationError}</p>}

              {/* ── Loading animation ── */}
              <AnimatePresence>
                {generatingDescription && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-6"
                  >
                    {/* Animated gradient orbs */}
                    <motion.div
                      animate={{ x: [0, 40, 0], opacity: [0.25, 0.5, 0.25] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                      className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-indigo-600/20 blur-3xl"
                    />
                    <motion.div
                      animate={{ x: [0, -30, 0], opacity: [0.2, 0.45, 0.2] }}
                      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                      className="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 rounded-full bg-violet-600/20 blur-3xl"
                    />

                    <div className="relative space-y-4">
                      {/* Spinner */}
                      <div className="flex items-center gap-3">
                        <div className="relative h-8 w-8 shrink-0">
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 border-r-violet-400"
                            style={{ display: "block" }}
                          />
                          <motion.span
                            animate={{ rotate: -360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-1 rounded-full border-2 border-transparent border-b-violet-300"
                            style={{ display: "block" }}
                          />
                        </div>
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={loadingMsgIndex}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.3 }}
                            className="text-sm font-medium text-zinc-200"
                          >
                            {LOADING_MESSAGES[loadingMsgIndex]}
                          </motion.p>
                        </AnimatePresence>
                      </div>

                      {/* Shimmer bars */}
                      {[0.7, 0.5, 0.85, 0.6].map((w, i) => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.2, 0.5, 0.2] }}
                          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.25, ease: "easeInOut" }}
                          className="h-2.5 rounded-full bg-white/10"
                          style={{ width: `${w * 100}%` }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generated description */}
              <AnimatePresence>
                {generatedDescription && !generatingDescription && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-200"
                  >
                    <p className="mb-3 text-xs uppercase tracking-[0.16em] text-zinc-400">Personalized style profile</p>
                    <MarkdownProfile markdown={generatedDescription} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 flex items-center justify-between">
        <button type="button" onClick={prevStep} disabled={step === 1}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-200 transition enabled:hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" />Back
        </button>
        {step === 3 ? (
          <button type="button" onClick={() => onContinueToShop?.()} disabled={!generatedDescription || generatingDescription}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            View Recommendations<ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={nextStep} disabled={!canContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            Continue<ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}

// Render inline **bold** within a line of text.
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// Lightweight markdown renderer for the constrained profile summary
// (## headings, * / - bullets, **bold**, paragraphs).
function MarkdownProfile({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-1 list-disc space-y-1 pl-4 marker:text-violet-400">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets();
      blocks.push(
        <h4
          key={`h-${blocks.length}`}
          className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-violet-300 first:mt-0"
        >
          {heading[1].replace(/\*\*/g, "")}
        </h4>,
      );
      continue;
    }

    const bullet = /^[*-]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }

    flushBullets();
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed text-zinc-300">
        {renderInline(line)}
      </p>,
    );
  }
  flushBullets();

  return <div className="space-y-2 text-sm">{blocks}</div>;
}
