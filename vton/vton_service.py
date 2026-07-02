"""
FastAPI wrapper around CatVTON for the Personalized Styling AI app.

Mirrors the exact pipeline call from app.py's submit_function, but exposes it as
a JSON HTTP endpoint instead of a Gradio UI. The heavy models (pipeline, mask
generators) load ONCE at startup and stay resident in GPU memory.

Run from inside the CatVTON folder, with the `catvton` conda env active:
    uvicorn vton_service:app --host 127.0.0.1 --port 8500

POST /tryon
    { "person": "<base64 image>", "cloth": "<base64 image>", "cloth_type": "upper" | "lower" | "overall" }
  -> { "image": "<base64 PNG of the try-on result>" }
"""

import base64
import io
import os

import torch
from diffusers.image_processor import VaeImageProcessor
from fastapi import FastAPI
from huggingface_hub import snapshot_download
from PIL import Image
from pydantic import BaseModel

from model.cloth_masker import AutoMasker
from model.pipeline import CatVTONPipeline
from utils import init_weight_dtype, resize_and_crop, resize_and_padding

# ---- Config (matches app.py defaults) ----
BASE_MODEL_PATH = "booksforcharlie/stable-diffusion-inpainting"
RESUME_PATH = "zhengchong/CatVTON"
WIDTH = 768
HEIGHT = 1024
MIXED_PRECISION = "bf16"

# ---- Load models once at startup ----
print("[vton_service] Downloading / locating checkpoints…")
repo_path = snapshot_download(repo_id=RESUME_PATH)

print("[vton_service] Loading CatVTON pipeline onto CUDA…")
pipeline = CatVTONPipeline(
    base_ckpt=BASE_MODEL_PATH,
    attn_ckpt=repo_path,
    attn_ckpt_version="mix",
    weight_dtype=init_weight_dtype(MIXED_PRECISION),
    use_tf32=True,
    device="cuda",
)

mask_processor = VaeImageProcessor(
    vae_scale_factor=8, do_normalize=False, do_binarize=True, do_convert_grayscale=True
)
automasker = AutoMasker(
    densepose_ckpt=os.path.join(repo_path, "DensePose"),
    schp_ckpt=os.path.join(repo_path, "SCHP"),
    device="cuda",
)
print("[vton_service] Ready.")

app = FastAPI()


class TryOnRequest(BaseModel):
    person: str  # base64 image
    cloth: str  # base64 image
    cloth_type: str = "upper"  # upper | lower | overall
    num_inference_steps: int = 50
    guidance_scale: float = 2.5
    seed: int = 42


def _decode_image(b64: str) -> Image.Image:
    # Tolerate data URLs (data:image/png;base64,XXXX)
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _encode_png(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@app.get("/health")
def health():
    return {"status": "ok", "cuda": torch.cuda.is_available()}


@app.post("/tryon")
def tryon(req: TryOnRequest):
    cloth_type = req.cloth_type if req.cloth_type in ("upper", "lower", "overall") else "upper"

    person_image = _decode_image(req.person)
    cloth_image = _decode_image(req.cloth)

    person_image = resize_and_crop(person_image, (WIDTH, HEIGHT))
    cloth_image = resize_and_padding(cloth_image, (WIDTH, HEIGHT))

    # Auto-generate the garment mask (DensePose + SCHP), same as the demo.
    mask = automasker(person_image, cloth_type)["mask"]
    mask = mask_processor.blur(mask, blur_factor=9)

    generator = None
    if req.seed != -1:
        generator = torch.Generator(device="cuda").manual_seed(req.seed)

    result_image = pipeline(
        image=person_image,
        condition_image=cloth_image,
        mask=mask,
        num_inference_steps=req.num_inference_steps,
        guidance_scale=req.guidance_scale,
        generator=generator,
    )[0]

    return {"image": _encode_png(result_image)}