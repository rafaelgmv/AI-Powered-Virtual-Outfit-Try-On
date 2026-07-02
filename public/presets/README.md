# Portrait presets

Preset portraits shown in the "Choose preset" tab in step 1.

**Everything is driven by `presets.csv`** — no code changes needed to add, remove,
or rename a preset. The component (`components/StyleForm.tsx`) fetches this CSV at
runtime and builds the picker from it.

## presets.csv format

Header row, then one row per preset:

```
file,ethnicity,gender,name,height,weight,bodyType
asian_girl_1.png,Asian,Female,Liu Wen,178,55,Slim
```

- `file` — exact filename (with extension) of the image in this folder.
- `ethnicity`, `gender` — combined into the small category label (e.g. "Asian · Female").
- `name` — the person's name shown under the thumbnail.
- `height`, `weight`, `bodyType` — the model's build. When a user selects this
  preset, these auto-fill and **lock** the step-1 Height/Weight/Body Type fields
  (so the avatar build matches the model). Deselecting the preset restores the
  user's own typed values. Clothing sizes are never locked — they stay the
  user's, since they drive the product search.
  - Leave these blank to not lock anything for that preset.
  - `bodyType` should match one of the step-1 options (Athletic, Slim, Average,
    Muscular, Curvy, Petite, Plus Size) so the select shows it correctly.

Do not put commas inside any field (the parser is positional).

## To add a preset

1. Drop the image into `public/presets/`.
2. Add a row to `presets.csv` with its filename, ethnicity, gender, and name.

That's it — it appears in the picker on next load.

Note: these are real people's photos used as selectable preview avatars. Fine for
an educational/non-commercial project; revisit likeness/publicity rights before
any public or commercial release.
