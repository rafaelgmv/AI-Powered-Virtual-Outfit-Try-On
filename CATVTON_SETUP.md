# CatVTON local setup (virtual try-on backend)

This project's try-on preview is powered by **CatVTON**, a virtual try-on
diffusion model that runs **locally on an NVIDIA GPU** as a separate Python
service. CatVTON is Python/PyTorch — it cannot run inside Next.js/Node, so it
lives in its own environment and the web app talks to it over HTTP.

These steps get CatVTON's own demo running (the prerequisite before any
integration). They include fixes for the two dependency issues we actually hit.

---

## Requirements

- **NVIDIA GPU** (tested on an RTX 4070 Ti, 12 GB VRAM — CatVTON fits comfortably).
- **Git** — https://git-scm.com/download/win
- **Miniconda** — https://www.anaconda.com/download/success
  (a separate, isolated Python 3.10 env; do not use a system Python 3.11+ — the
  ML stack has no stable wheels for it yet)
- A free **Hugging Face account + token** (the base model is gated/downloaded
  from HF on first run): https://huggingface.co → Settings → Access Tokens

---

## Steps

> Run everything below with the `(catvton)` environment **active**. If you close
> the terminal, re-run `conda activate catvton` before continuing.

### 1. Create the isolated Python 3.10 environment
```
conda create -n catvton python=3.10 -y
conda activate catvton
```
Your prompt should now start with `(catvton)`.

### 2. Clone CatVTON
```
git clone https://github.com/Zheng-Chong/CatVTON
cd CatVTON
```

### 3. Install CatVTON's requirements
```
pip install -r requirements.txt
```
> Note: this installs `torch==2.4.0` from the **default (CPU-only) index**. The
> CUDA build is installed in the next step — order matters, see the warning there.

### 4. Install the CUDA build of PyTorch (AFTER requirements)
`requirements.txt` pins `torch==2.4.0` with no CUDA index, so it installs the
**CPU-only** wheel. You MUST overwrite it with the CUDA build *after* installing
requirements (doing it before is pointless — requirements clobbers it):
```
pip install --force-reinstall torch==2.4.0 torchvision==0.19.0 --index-url https://download.pytorch.org/whl/cu121
```
Verify CUDA is actually available — this MUST print `True` and your GPU name:
```
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```
If it prints `False` (or the version ends in `+cpu`), the CPU wheel is still
installed — re-run the force-reinstall above. Symptom at runtime:
`AssertionError: Torch not compiled with CUDA enabled`.

### 4b. Re-pin the deps the force-reinstall dragged in (REQUIRED)

`--force-reinstall` of torch in step 4 pulls newer transitive packages that
break the rest of the stack. Pin them back to versions contemporaneous with the
pinned `gradio==4.41.0`:
```
pip install "numpy==1.26.4" "pydantic==2.8.2" "fastapi==0.112.2"
```
**Why:**
- `numpy==1.26.4` — torch 2.4.0 is built against NumPy 1.x; a NumPy 2.x dragged
  in here causes `UserWarning: Failed to initialize NumPy: _ARRAY_API not found`
  and tensor↔array conversions break during try-on.
- `pydantic==2.8.2` + `fastapi==0.112.2` — newer versions emit a JSON schema that
  Gradio 4.41's `gradio_client` can't parse, giving a constant **Internal Server
  Error** on page load with `TypeError: argument of type 'bool' is not iterable`
  (in `gradio_client/utils.py`, `if "const" in schema`).

(Red `pip` "dependency conflict" warnings about `markupsafe`/`pillow`/etc. after
these are advisory — ignore them unless the demo actually fails to run.)

### 5. Apply the two dependency fixes (REQUIRED)

CatVTON's `requirements.txt` installs `diffusers` from the live GitHub `main`
branch **unpinned** (`git+https://github.com/huggingface/diffusers.git`), so a
fresh install pulls a too-new `diffusers` that breaks against the pinned
`torch==2.4.0`. Fixing that then exposes a too-old `accelerate`. Pin both:

```
pip install diffusers==0.31.0
pip install accelerate==0.34.2
```

**Why these versions:**
- `diffusers==0.31.0` — contemporaneous with the pinned `torch 2.4.0` /
  `transformers 4.46.3`; predates the flash-attention-3 / `ace_step_transformer`
  code that the bleeding-edge `diffusers` `main` introduced. Without this you get:
  `ValueError: infer_schema(func): Parameter q has unsupported type torch.Tensor`.
- `accelerate==0.34.2` — `diffusers 0.31.0` needs `clear_device_cache`, which
  the requirements' pinned `accelerate==0.31.0` is too old to have. Without this
  you get: `ImportError: cannot import name 'clear_device_cache' from
  'accelerate.utils.memory'`.

### 6. Run the demo (downloads the weights)
```
python app.py
```
First run downloads several GB of model weights (10-20 min). If prompted, log in
to Hugging Face (`huggingface-cli login` with your token). When it finishes it
prints a local URL (e.g. http://127.0.0.1:7860).

### 7. Confirm it works
Open the URL, upload a person photo + a garment photo, and generate a try-on
image. **Getting one image out is the success gate** — once CatVTON produces an
image on your GPU, the model half is proven.

(Steps 6-7 run CatVTON's own Gradio demo. The styling app doesn't use that demo —
it talks to the FastAPI service below. The demo is just the proof-of-life gate.)

---

## Running the app's try-on (two processes)

The "Generate Preview" feature in the styling app calls a local FastAPI service
(`vton_service.py`, in the CatVTON folder) that wraps CatVTON. You run **two
processes at once**, in two terminals.

### Terminal 1 — the CatVTON service
```
conda activate catvton
cd <path to>\CatVTON
python -m uvicorn vton_service:app --host 127.0.0.1 --port 8500
```
- If `uvicorn`/`fastapi` are missing: `python -m pip install uvicorn fastapi`.
- Use `python -m uvicorn ...` (not bare `uvicorn`) — the env's Scripts may not be
  on PATH, and `python -m` finds it regardless.
- Wait for `[vton_service] Ready.` (first start loads the weights into VRAM).
  Leave this terminal running.
- Sanity check: open http://127.0.0.1:8500/health — should show
  `{"status":"ok","cuda":true}`.

### Terminal 2 — the web app (in the Next.js project folder)
```
npm run dev
```
Open http://localhost:3000, fill the form, generate a style profile, scroll to
the shop, pick a **top + bottom** (outerwear optional; shoes can't be previewed),
and click **Generate Preview**. The Front view fills in after two CatVTON passes
(give it time — two diffusion runs). The Side view stays a placeholder by design.

> Override the service URL with the `VTON_SERVICE_URL` env var if you run it on a
> different host/port (defaults to `http://127.0.0.1:8500`).

### Tuning quality (optional)
CatVTON is a research model — results are decent, not campaign-quality. Two cheap
levers in `vton_service.py`: raise `num_inference_steps` (default 50), or change
`seed` (affects shadows/artifacts).

---

## Troubleshooting recap

| Error contains | Fix |
|---|---|
| `infer_schema(func): Parameter q has unsupported type torch.Tensor` | `pip install diffusers==0.31.0` (diffusers too new for torch 2.4.0) |
| `cannot import name 'clear_device_cache' from 'accelerate.utils.memory'` | `pip install accelerate==0.34.2` (accelerate too old for diffusers 0.31.0) |
| `AssertionError: Torch not compiled with CUDA enabled` / `cuda.is_available()` is `False` | `requirements.txt` overwrote the CUDA torch with the CPU wheel — re-run the force-reinstall in step 4 (do it AFTER requirements) |
| `UserWarning: Failed to initialize NumPy: _ARRAY_API not found` | NumPy 2.x got pulled in — `pip install "numpy==1.26.4"` (step 4b) |
| Internal Server Error on page load, `TypeError: argument of type 'bool' is not iterable` (`gradio_client/utils.py`, `if "const" in schema`) | pydantic/fastapi too new for gradio 4.41 — `pip install "pydantic==2.8.2" "fastapi==0.112.2"` (step 4b) |

The env is disposable: if the dependency state gets tangled, `conda deactivate`
then `conda env remove -n catvton` wipes it, and you redo from step 1.
