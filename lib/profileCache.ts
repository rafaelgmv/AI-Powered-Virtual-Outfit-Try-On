// Browser-only persistence of a user's styling profile, so a returning visitor
// skips the cold start. Stored in localStorage (no backend/accounts). All access
// is SSR-guarded because Next.js renders this app on the server too.

const STORAGE_KEY = "styling-profile-v1";

export type CachedProfile = {
  // Step 1 — physical data + sizes
  height: string;
  weight: string;
  bodyType: string;
  topSize: string;
  pantsSize: string;
  shoesSize: string;
  // Portrait
  portraitUrl: string | null;
  portraitLabel: string | null;
  portraitMode: "upload" | "preset";
  selectedPreset: string | null;
  // Step 2 — style
  selectedStyle: string | null;
  styleNotes: string;
  // Step 3 — reference images (URLs + display names, files already on disk)
  uploadedImageUrls: string[];
  imageNames: string[];
  // Generated outputs
  generatedDescription: string;
  queries: { tops: string; bottoms: string; shoes: string; outerwear: string };
};

export const loadProfile = (): CachedProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedProfile;
  } catch {
    return null;
  }
};

export const saveProfile = (profile: CachedProfile): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage can throw (quota / privacy mode) — caching is best-effort.
  }
};

export const clearProfile = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
