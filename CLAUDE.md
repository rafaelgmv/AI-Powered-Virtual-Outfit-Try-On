# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint via next lint
```

No test framework configured.

## Environment Setup

Copy `.env.example` to `.env.local`. Default uses local Ollama:


## Architecture

**Personal Styling AI** — users input physical attributes, select a style preference, upload inspiration images, and receive an LLM-generated style profile.

### Stack
- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS, Framer Motion, Lucide React

### Data Flow

```
StyleForm (3-step wizard)
  → POST /api/upload         (saves images to /public/uploads/)
  → POST /api/style-description
      → lib/styleDescription.ts  (reads images from disk, calls LLM)
      → returns markdown style profile
```

### Key Files

- `components/StyleForm.tsx` — 3-step form: physical data → style selection → image upload + generate
- `lib/styleDescription.ts` — dual LLM provider (Ollama/OpenAI), image→base64, prompt engineering
- `app/api/upload/route.ts` — validates (JPEG/PNG/WebP/AVIF/GIF, max 5MB), sanitizes filenames, saves to `/public/uploads/`
- `app/api/style-description/route.ts` — validates request, calls `lib/styleDescription.ts`
- `app/page.tsx` — hero section + two-column layout (form left, avatar placeholder right)

### LLM Provider

`lib/styleDescription.ts` selects provider via `LLM_PROVIDER` env var. Both providers receive user physical data + style preference + base64-encoded uploaded images. The prompt requests an 8-section markdown profile (identity, visual analysis, silhouettes, colors, fabrics, outfit formulas, do/avoid, shopping keywords).

### Style Options

6 mutually-exclusive styles: `streetwear`, `casual`, `classic`, `oversized`, `alternative`, `sporty`.

## Response Style

Be concise and direct. Write code immediately for implementation tasks. Avoid over-explaining in order to save credits and tokens.
