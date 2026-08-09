import os
from typing import Dict, List

# The C: drive on this machine is nearly full; huggingface_hub reads its
# cache location from HF_HOME at import time, so this must be set before
# transformers is imported anywhere in the process. Redirect it onto the
# project's own drive instead of the default C:\Users\...\.cache.
os.environ.setdefault(
    "HF_HOME",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".hf_cache")),
)

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_NAME = "openai/clip-vit-base-patch32"

# Ensembled prompt PAIRS, not a single pair -- and only on the CROPPED
# top strip of the frame (see WETNESS_CROP_FRAC below), not the full image.
#
# A real onboard F1 frame is mostly car/halo/driver with only a sliver of
# track visible, under flat overcast light that makes dry asphalt look
# dark. Measured against a real all-dry reference lap:
#   - full frame, generic "racetrack surface" prompts: ~0.53 avg wetness
#     (worse than random -- reads a dry lap as wet)
#   - full frame, onboard-scene-aware prompts:          still ~0.5 avg
#   - top-35%-crop, onboard-scene-aware prompts:         ~0.22-0.33 avg
# A generic "asphalt tarmac" prompt pair (no mention of the car/onboard
# framing) was tested and measured *worse than random* even when cropped
# (0.66 avg on known-dry frames) and was dropped rather than kept at a
# lower ensemble weight.
PROMPT_PAIRS = [
    (
        "an onboard camera view from inside a Formula 1 car, driving on a dry, "
        "grippy asphalt racetrack under an overcast sky",
        "an onboard camera view from inside a Formula 1 car, driving on a wet, "
        "rain-soaked racetrack with visible spray and standing water",
    ),
    (
        "a photo of a Formula 1 car racing on a dry track in clear conditions",
        "a photo of a Formula 1 car racing on a wet track in the rain, throwing up spray",
    ),
]

# Onboard halo cams keep the track surface in roughly the top third of the
# frame, with the car/halo/driver dominating the rest -- cropping to that
# strip before scoring is what actually made dry-vs-wet separable (see
# above). Doesn't hold for every possible camera angle (trackside/aerial
# shots would be cropping away real signal); acceptable trade for now
# since onboard is what's actually been tested against real footage.
WETNESS_CROP_FRAC = 0.35

# Filters out frames that aren't live racing footage at all -- title cards,
# sponsor bumpers, and outro graphics get spliced into real YouTube clips
# and would otherwise get scored as if they were track conditions.
RACING_PROMPTS = (
    "a live action photo of a Formula 1 car racing on a track, either an "
    "onboard camera shot or a trackside/aerial shot of the race",
    "a graphic, logo, title card, sponsor advertisement, or text overlay "
    "screen -- not live racing footage",
)

RACING_THRESHOLD = 0.5

_model = None
_processor = None
_dry_wet_text_features: List[torch.Tensor] = []
_racing_text_features = None


def _embed_texts(prompts) -> torch.Tensor:
    inputs = _processor(text=list(prompts), return_tensors="pt", padding=True)
    # transformers>=5: get_text_features returns a BaseModelOutputWithPooling;
    # the projected embedding is in .pooler_output, not the return value itself.
    feats = _model.get_text_features(**inputs).pooler_output
    return feats / feats.norm(dim=-1, keepdim=True)


def load():
    """Load CLIP once and cache all prompt-pair embeddings. Safe to call
    repeatedly -- only does real work the first time."""
    global _model, _processor, _dry_wet_text_features, _racing_text_features
    if _model is not None:
        return
    _model = CLIPModel.from_pretrained(MODEL_NAME)
    _model.eval()
    _processor = CLIPProcessor.from_pretrained(MODEL_NAME)
    with torch.no_grad():
        _dry_wet_text_features = [_embed_texts(pair) for pair in PROMPT_PAIRS]
        _racing_text_features = _embed_texts(RACING_PROMPTS)


def _image_features(image: Image.Image) -> torch.Tensor:
    image_inputs = _processor(images=image, return_tensors="pt")
    feats = _model.get_image_features(**image_inputs).pooler_output
    return feats / feats.norm(dim=-1, keepdim=True)


def _crop_top(image: Image.Image, frac: float = WETNESS_CROP_FRAC) -> Image.Image:
    w, h = image.size
    return image.crop((0, 0, w, int(h * frac)))


def _wetness_from_features(feats: torch.Tensor) -> float:
    scores = []
    for text_features in _dry_wet_text_features:
        logits = (feats @ text_features.T) * _model.logit_scale.exp()
        probs = logits.softmax(dim=-1)[0]
        scores.append(float(probs[1].item()))  # P(wet) for this prompt pair
    return sum(scores) / len(scores)


def _racing_confidence_from_features(feats: torch.Tensor) -> float:
    logits = (feats @ _racing_text_features.T) * _model.logit_scale.exp()
    probs = logits.softmax(dim=-1)[0]
    return float(probs[0].item())  # P(is live racing footage)


def analyze_frame(image_path: str) -> Dict[str, float]:
    """Both signals for one frame in a single load: wetness score (cropped)
    and racing-footage confidence (full frame). The canonical entry point --
    used by both the request pipeline (main.py) and scripts/calibrate_vision.py
    so there's one code path, not two that could drift apart."""
    load()
    image = Image.open(image_path).convert("RGB")
    with torch.no_grad():
        wet_feats = _image_features(_crop_top(image))
        racing_feats = _image_features(image)
        return {
            "wetness": _wetness_from_features(wet_feats),
            "is_racing": _racing_confidence_from_features(racing_feats),
        }


def analyze_frames(image_paths: List[str]) -> List[Dict[str, float]]:
    return [analyze_frame(p) for p in image_paths]


def score_frame(image_path: str) -> float:
    """Wetness score only -- see analyze_frame() if you also need the
    racing-footage check, it's cheaper than calling both separately."""
    return analyze_frame(image_path)["wetness"]


def is_racing_frame(image_path: str) -> bool:
    """False for title cards, sponsor bumpers, and other non-track graphics
    that end up spliced into real footage -- these should be dropped before
    they pollute the wetness trend, not scored as if they were the track."""
    return analyze_frame(image_path)["is_racing"] >= RACING_THRESHOLD


def score_frames(frame_paths: List[str]) -> List[float]:
    return [score_frame(p) for p in frame_paths]
