#!/usr/bin/env python3
"""
Local SAM2 segmentation server for sprite-animator.

Endpoint:
  POST /sam2/segment
Body:
  {
    "image": "data:image/png;base64,...",
    "points_per_side": 32,
    "pred_iou_thresh": 0.8,
    "stability_score_thresh": 0.95,
    "use_m2m": true
  }
Response:
  image/png mask (white foreground, black background)
"""

from __future__ import annotations

import base64
import inspect
import io
import os
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageDraw
from pydantic import BaseModel, Field

try:
    import torch
except Exception as exc:  # pragma: no cover - runtime environment issue
    raise RuntimeError("PyTorch is required. Install torch before running this server.") from exc

try:
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from sam2.build_sam import build_sam2
except Exception as exc:  # pragma: no cover - runtime environment issue
    raise RuntimeError(
        "SAM2 imports failed. Install SAM2 from source in this environment."
    ) from exc


class SegmentRequest(BaseModel):
    image: str
    points_per_side: int = Field(default=32, ge=8, le=128)
    pred_iou_thresh: float = Field(default=0.8, ge=0, le=1)
    stability_score_thresh: float = Field(default=0.95, ge=0, le=1)
    use_m2m: bool = True


class PartsRequest(SegmentRequest):
    max_regions: int = Field(default=12, ge=4, le=40)


@dataclass(frozen=True)
class Sam2Config:
    config_path: str
    checkpoint_path: str
    device: str


def parse_data_url(data_url: str) -> bytes:
    if not data_url.startswith("data:"):
        raise HTTPException(
            status_code=400,
            detail="Only data URL images are supported (expected data:image/...;base64,...)",
        )
    try:
        _, encoded = data_url.split(",", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid data URL format") from exc
    try:
        return base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload") from exc


def image_from_data_url(data_url: str) -> Image.Image:
    image_bytes = parse_data_url(data_url)
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not decode image data") from exc
    return image


def pil_to_rgb_numpy(image: Image.Image) -> np.ndarray:
    rgb = image.convert("RGB")
    arr = np.asarray(rgb, dtype=np.uint8)
    if arr.ndim != 3 or arr.shape[2] != 3:
        raise HTTPException(status_code=400, detail="Decoded image must be RGB-like")
    return arr


def build_generator(model: Any, req: SegmentRequest) -> SAM2AutomaticMaskGenerator:
    signature = inspect.signature(SAM2AutomaticMaskGenerator.__init__)
    supported = set(signature.parameters.keys())
    kwargs: dict[str, Any] = {}
    if "points_per_side" in supported:
        kwargs["points_per_side"] = req.points_per_side
    if "pred_iou_thresh" in supported:
        kwargs["pred_iou_thresh"] = req.pred_iou_thresh
    if "stability_score_thresh" in supported:
        kwargs["stability_score_thresh"] = req.stability_score_thresh
    if "use_m2m" in supported:
        kwargs["use_m2m"] = req.use_m2m
    return SAM2AutomaticMaskGenerator(model=model, **kwargs)


def combine_masks(mask_items: list[dict[str, Any]], height: int, width: int) -> np.ndarray:
    if not mask_items:
        return np.zeros((height, width), dtype=np.uint8)

    combined = np.zeros((height, width), dtype=bool)
    for item in mask_items:
        seg = item.get("segmentation")
        if seg is None:
            continue
        seg_arr = np.asarray(seg, dtype=bool)
        if seg_arr.shape != (height, width):
            continue
        combined |= seg_arr

    return combined.astype(np.uint8) * 255


def png_response_from_mask(mask_luma: np.ndarray) -> Response:
    mask_img = Image.fromarray(mask_luma, mode="L")
    out = io.BytesIO()
    mask_img.save(out, format="PNG")
    return Response(content=out.getvalue(), media_type="image/png")


def data_url_from_pil_png(image: Image.Image) -> str:
    out = io.BytesIO()
    image.save(out, format="PNG")
    encoded = base64.b64encode(out.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    x0 = int(xs.min())
    y0 = int(ys.min())
    x1 = int(xs.max())
    y1 = int(ys.max())
    return (x0, y0, x1 - x0 + 1, y1 - y0 + 1)


def centroid_from_mask(mask: np.ndarray) -> tuple[float, float] | None:
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    return (float(xs.mean()), float(ys.mean()))


def mask_touches_border(mask: np.ndarray) -> bool:
    if mask.shape[0] == 0 or mask.shape[1] == 0:
        return False
    return bool(mask[0, :].any() or mask[-1, :].any() or mask[:, 0].any() or mask[:, -1].any())


def alpha_opaque_mask(image: Image.Image, alpha_threshold: int = 8) -> np.ndarray:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    return alpha >= alpha_threshold


def estimate_foreground_mask_from_edges(
    image: Image.Image,
    fallback_mask: np.ndarray,
    channel_tolerance: int = 26,
) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    h, w = rgba.shape[0], rgba.shape[1]
    if h <= 2 or w <= 2:
        return fallback_mask

    total = h * w
    fallback_area = int(fallback_mask.sum())
    # Only run this when alpha is almost fully opaque (common for flat background sprites/screenshots).
    if fallback_area < int(total * 0.94):
        return fallback_mask

    rgb = rgba[:, :, :3].astype(np.int16)
    corners = np.stack(
        [rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]], axis=0
    )

    diff = np.abs(rgb[:, :, None, :] - corners[None, None, :, :]).sum(axis=3)
    min_diff = diff.min(axis=2)
    threshold = int(channel_tolerance) * 3
    candidate_bg = min_diff <= threshold

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        if candidate_bg[0, x]:
            visited[0, x] = True
            q.append((0, x))
        if candidate_bg[h - 1, x] and not visited[h - 1, x]:
            visited[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(h):
        if candidate_bg[y, 0] and not visited[y, 0]:
            visited[y, 0] = True
            q.append((y, 0))
        if candidate_bg[y, w - 1] and not visited[y, w - 1]:
            visited[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        if y > 0 and candidate_bg[y - 1, x] and not visited[y - 1, x]:
            visited[y - 1, x] = True
            q.append((y - 1, x))
        if y + 1 < h and candidate_bg[y + 1, x] and not visited[y + 1, x]:
            visited[y + 1, x] = True
            q.append((y + 1, x))
        if x > 0 and candidate_bg[y, x - 1] and not visited[y, x - 1]:
            visited[y, x - 1] = True
            q.append((y, x - 1))
        if x + 1 < w and candidate_bg[y, x + 1] and not visited[y, x + 1]:
            visited[y, x + 1] = True
            q.append((y, x + 1))

    foreground = ~visited
    fg_area = int(foreground.sum())
    if fg_area < int(total * 0.03) or fg_area > int(total * 0.97):
        return fallback_mask
    return foreground


def assign_part_label(
    mask: np.ndarray,
    character_bbox: tuple[int, int, int, int],
    character_area: int,
) -> str:
    bbox = bbox_from_mask(mask)
    centroid = centroid_from_mask(mask)
    if bbox is None or centroid is None or character_area <= 0:
        return "other"

    char_x, char_y, char_w, char_h = character_bbox
    cx, cy = centroid
    _, _, bw, bh = bbox
    nx = (cx - char_x) / max(1, char_w)
    ny = (cy - char_y) / max(1, char_h)
    area_ratio = float(mask.sum()) / float(character_area)
    bw_ratio = bw / max(1, char_w)
    bh_ratio = bh / max(1, char_h)

    if area_ratio >= 0.68:
        return "other"

    # Very large masks are typically the body silhouette or leaked background region.
    if bw_ratio >= 0.84 and bh_ratio >= 0.84:
        return "other"

    if ny < 0.28 and area_ratio <= 0.22:
        return "head"

    if (
        area_ratio >= 0.08
        and 0.24 <= ny <= 0.72
        and abs(nx - 0.5) <= 0.24
        and 0.18 <= bw_ratio <= 0.74
        and 0.22 <= bh_ratio <= 0.78
    ):
        return "torso"

    if ny >= 0.58:
        return "left_leg" if nx < 0.5 else "right_leg"

    if bw_ratio >= 0.34 and bh_ratio <= 0.24 and 0.25 <= ny <= 0.7:
        return "weapon_or_accessory"

    if 0.2 <= ny <= 0.78:
        if nx < 0.45:
            return "left_arm"
        if nx > 0.55:
            return "right_arm"

    if ny > 0.5:
        return "left_leg" if nx < 0.5 else "right_leg"

    return "other"


def build_part_masks(
    mask_items: list[dict[str, Any]],
    height: int,
    width: int,
    max_regions: int,
    source_opaque_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, dict[str, np.ndarray], list[tuple[str, np.ndarray]]]:
    if not mask_items:
        empty = np.zeros((height, width), dtype=bool)
        return empty, {}, []

    opaque_mask = source_opaque_mask
    opaque_area = 0
    if opaque_mask is not None and opaque_mask.shape == (height, width):
        opaque_area = int(opaque_mask.sum())
        if opaque_area <= 0:
            opaque_mask = None
    else:
        opaque_mask = None

    masks: list[np.ndarray] = []
    for item in mask_items:
        seg = item.get("segmentation")
        if seg is None:
            continue
        arr = np.asarray(seg, dtype=bool)
        if arr.shape != (height, width):
            continue

        raw_area = int(arr.sum())
        if raw_area <= 0:
            continue

        region = arr
        if opaque_mask is not None:
            region = arr & opaque_mask
            region_area = int(region.sum())
            if region_area <= 0:
                continue

            # Reject regions that are mostly outside opaque sprite pixels.
            overlap_ratio = float(region_area) / float(max(1, raw_area))
            if overlap_ratio < 0.18:
                continue
        else:
            region_area = raw_area

        # Reject giant border-connected regions; these are usually background leakage.
        reference_area = max(1, opaque_area if opaque_area > 0 else height * width)
        if mask_touches_border(region) and float(region_area) / float(reference_area) > 0.78:
            continue

        masks.append(region)

    if not masks:
        if opaque_mask is not None and int(opaque_mask.sum()) > 0:
            return opaque_mask.copy(), {"other": opaque_mask.copy()}, [("other", opaque_mask.copy())]
        empty = np.zeros((height, width), dtype=bool)
        return empty, {}, []

    character_mask = np.zeros((height, width), dtype=bool)
    for arr in masks:
        character_mask |= arr

    if opaque_mask is not None:
        character_mask &= opaque_mask

    character_area = int(character_mask.sum())
    if character_area <= 0:
        if opaque_mask is not None and int(opaque_mask.sum()) > 0:
            fallback = opaque_mask.copy()
            return fallback, {"other": fallback.copy()}, [("other", fallback.copy())]
        return character_mask, {}, []

    min_area = max(32, int(character_area * 0.0015))

    masks_sorted = sorted(masks, key=lambda m: int(m.sum()), reverse=True)
    selected: list[np.ndarray] = []
    for arr in masks_sorted:
        area = int(arr.sum())
        if area < min_area:
            continue

        is_duplicate = False
        for existing in selected:
            existing_area = int(existing.sum())
            if existing_area <= 0:
                continue
            inter = int((arr & existing).sum())
            union = int((arr | existing).sum())
            if union <= 0:
                continue
            iou = float(inter) / float(union)
            size_ratio = float(area) / float(max(1, existing_area))
            containment = float(inter) / float(max(1, area))
            if iou >= 0.92 and 0.8 <= size_ratio <= 1.25:
                is_duplicate = True
                break
            if containment >= 0.985 and size_ratio >= 0.9:
                is_duplicate = True
                break

        if is_duplicate:
            continue

        selected.append(arr.copy())
        if len(selected) >= max_regions:
            break

    if not selected:
        selected = [character_mask]

    char_bbox = bbox_from_mask(character_mask) or (0, 0, width, height)
    merged: dict[str, np.ndarray] = {}
    labeled_regions: list[tuple[str, np.ndarray]] = []
    for region in selected:
        label = assign_part_label(region, char_bbox, character_area)
        labeled_regions.append((label, region.copy()))
        if label in merged:
            merged[label] |= region
        else:
            merged[label] = region.copy()

    # Prevent extremely large "torso" mistakes and recover a torso candidate from the main body mask.
    torso_mask = merged.get("torso")
    if torso_mask is not None:
        torso_ratio = float(int(torso_mask.sum())) / float(max(1, character_area))
        if torso_ratio > 0.58:
            del merged["torso"]
            labeled_regions = [(label, reg) for label, reg in labeled_regions if label != "torso"]

    if "torso" not in merged and selected:
        primary_mask = selected[0].copy()
        for key in ("head", "left_arm", "right_arm", "left_leg", "right_leg", "weapon_or_accessory"):
            if key in merged:
                primary_mask &= ~merged[key]

        x, y, w_box, h_box = char_bbox
        x0 = int(x + w_box * 0.28)
        x1 = int(x + w_box * 0.72)
        y0 = int(y + h_box * 0.28)
        y1 = int(y + h_box * 0.78)
        window = np.zeros_like(primary_mask, dtype=bool)
        window[max(0, y0) : min(height, y1), max(0, x0) : min(width, x1)] = True
        primary_mask &= window

        torso_min_area = max(64, int(character_area * 0.03))
        torso_area = int(primary_mask.sum())
        torso_ratio = float(torso_area) / float(max(1, character_area))
        if torso_min_area <= torso_area <= int(character_area * 0.45) and torso_ratio <= 0.45:
            merged["torso"] = primary_mask
            labeled_regions.append(("torso", primary_mask.copy()))

    # If "other" absorbs almost the whole character, keep specific parts and drop the catch-all.
    if "other" in merged and len(merged) > 1:
        other_ratio = float(int(merged["other"].sum())) / float(max(1, character_area))
        if other_ratio >= 0.88:
            del merged["other"]
            labeled_regions = [(label, reg) for label, reg in labeled_regions if label != "other"]

    return character_mask, merged, labeled_regions


def build_parts_preview(
    source_rgba: Image.Image,
    character_mask: np.ndarray,
    part_masks: dict[str, np.ndarray],
) -> tuple[str, list[dict[str, Any]]]:
    color_map: dict[str, tuple[int, int, int]] = {
        "head": (255, 99, 132),
        "torso": (54, 162, 235),
        "left_arm": (255, 205, 86),
        "right_arm": (75, 192, 192),
        "left_leg": (153, 102, 255),
        "right_leg": (255, 159, 64),
        "weapon_or_accessory": (201, 203, 207),
        "other": (129, 255, 161),
    }

    src = np.asarray(source_rgba.convert("RGBA"), dtype=np.uint8).copy()
    out = src.copy()

    total_area = int(character_mask.sum())
    parts: list[dict[str, Any]] = []

    for label, mask in part_masks.items():
        area = int(mask.sum())
        if area <= 0:
            continue
        bbox = bbox_from_mask(mask)
        centroid = centroid_from_mask(mask)
        if bbox is None or centroid is None:
            continue

        color = color_map.get(label, color_map["other"])
        alpha = 0.48
        out[mask, 0] = np.clip((1.0 - alpha) * out[mask, 0] + alpha * color[0], 0, 255).astype(np.uint8)
        out[mask, 1] = np.clip((1.0 - alpha) * out[mask, 1] + alpha * color[1], 0, 255).astype(np.uint8)
        out[mask, 2] = np.clip((1.0 - alpha) * out[mask, 2] + alpha * color[2], 0, 255).astype(np.uint8)

        parts.append(
            {
                "label": label,
                "area": area,
                "area_ratio": float(area) / float(max(1, total_area)),
                "bbox": [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])],
                "centroid": [round(float(centroid[0]), 2), round(float(centroid[1]), 2)],
                "color": f"rgb({color[0]},{color[1]},{color[2]})",
            }
        )

    preview = Image.fromarray(out, mode="RGBA")
    draw = ImageDraw.Draw(preview)
    for part in parts:
        x, y, w, h = part["bbox"]
        color = part["color"].replace("rgb(", "").replace(")", "").split(",")
        stroke = tuple(int(c) for c in color)
        draw.rectangle([x, y, x + w - 1, y + h - 1], outline=stroke, width=2)
        label_text = part["label"].replace("_", " ")
        draw.text((x + 2, max(0, y - 14)), label_text, fill=stroke)

    parts.sort(key=lambda p: p["area"], reverse=True)
    return data_url_from_pil_png(preview), parts


def build_regions_preview(
    source_rgba: Image.Image,
    character_mask: np.ndarray,
    labeled_regions: list[tuple[str, np.ndarray]],
) -> tuple[str, list[dict[str, Any]]]:
    palette: list[tuple[int, int, int]] = [
        (255, 99, 132),
        (54, 162, 235),
        (255, 205, 86),
        (75, 192, 192),
        (153, 102, 255),
        (255, 159, 64),
        (129, 255, 161),
        (201, 203, 207),
        (247, 99, 220),
        (99, 247, 220),
        (220, 160, 99),
        (120, 180, 255),
    ]

    src = np.asarray(source_rgba.convert("RGBA"), dtype=np.uint8).copy()
    out = src.copy()
    total_area = int(character_mask.sum())
    regions: list[dict[str, Any]] = []

    for idx, (suggested_label, region_mask) in enumerate(labeled_regions):
        area = int(region_mask.sum())
        if area <= 0:
            continue

        bbox = bbox_from_mask(region_mask)
        centroid = centroid_from_mask(region_mask)
        if bbox is None or centroid is None:
            continue

        color = palette[idx % len(palette)]
        alpha = 0.52
        out[region_mask, 0] = np.clip(
            (1.0 - alpha) * out[region_mask, 0] + alpha * color[0], 0, 255
        ).astype(np.uint8)
        out[region_mask, 1] = np.clip(
            (1.0 - alpha) * out[region_mask, 1] + alpha * color[1], 0, 255
        ).astype(np.uint8)
        out[region_mask, 2] = np.clip(
            (1.0 - alpha) * out[region_mask, 2] + alpha * color[2], 0, 255
        ).astype(np.uint8)

        region_id = f"region_{idx + 1:02d}"
        regions.append(
            {
                "id": region_id,
                "suggested_label": suggested_label,
                "area": area,
                "area_ratio": float(area) / float(max(1, total_area)),
                "bbox": [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])],
                "centroid": [round(float(centroid[0]), 2), round(float(centroid[1]), 2)],
                "color": f"rgb({color[0]},{color[1]},{color[2]})",
            }
        )

    preview = Image.fromarray(out, mode="RGBA")
    draw = ImageDraw.Draw(preview)
    for region in regions:
        x, y, w, h = region["bbox"]
        color = region["color"].replace("rgb(", "").replace(")", "").split(",")
        stroke = tuple(int(c) for c in color)
        draw.rectangle([x, y, x + w - 1, y + h - 1], outline=stroke, width=2)
        label_text = f"{region['id']} ({region['suggested_label']})"
        draw.text((x + 2, max(0, y - 14)), label_text, fill=stroke)

    regions.sort(key=lambda r: r["area"], reverse=True)
    return data_url_from_pil_png(preview), regions


def resolve_sam2_config() -> Sam2Config:
    server_dir = Path(__file__).resolve().parent
    default_checkpoint = server_dir / "checkpoints" / "sam2.1_hiera_small.pt"

    default_config = server_dir / "configs" / "sam2.1" / "sam2.1_hiera_s.yaml"
    if not default_config.exists():
        try:
            import sam2 as sam2_pkg

            pkg_dir = Path(sam2_pkg.__file__).resolve().parent
            pkg_config = pkg_dir / "configs" / "sam2.1" / "sam2.1_hiera_s.yaml"
            if pkg_config.exists():
                default_config = pkg_config
        except Exception:
            pass

    env_config_path = os.environ.get("SAM2_CONFIG")
    env_checkpoint_path = os.environ.get("SAM2_CHECKPOINT")
    default_device = "cuda" if torch.cuda.is_available() else "cpu"

    if env_config_path and Path(env_config_path).exists():
        config_path = env_config_path
    elif env_config_path and not Path(env_config_path).exists():
        print(
            f"[WARN] SAM2_CONFIG was set but not found at '{env_config_path}'. Falling back to auto-detected config."
        )
        config_path = str(default_config)
    else:
        config_path = str(default_config)

    if env_checkpoint_path and Path(env_checkpoint_path).exists():
        checkpoint_path = env_checkpoint_path
    elif env_checkpoint_path and not Path(env_checkpoint_path).exists():
        print(
            f"[WARN] SAM2_CHECKPOINT was set but not found at '{env_checkpoint_path}'. Falling back to default checkpoint path."
        )
        checkpoint_path = str(default_checkpoint)
    else:
        checkpoint_path = str(default_checkpoint)

    device = os.environ.get("SAM2_DEVICE", default_device)

    if not Path(config_path).exists():
        raise RuntimeError(
            f"SAM2 config not found at '{config_path}'. Set SAM2_CONFIG to a valid sam2.1_hiera_s.yaml path."
        )
    if not Path(checkpoint_path).exists():
        raise RuntimeError(
            f"SAM2 checkpoint not found at '{checkpoint_path}'. Put sam2.1_hiera_small.pt in tools/sam2-local/checkpoints or set SAM2_CHECKPOINT."
        )

    return Sam2Config(
        config_path=config_path,
        checkpoint_path=checkpoint_path,
        device=device,
    )


def create_app() -> FastAPI:
    app = FastAPI(title="Local SAM2 Segmentation Server", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    cfg = resolve_sam2_config()
    model = build_sam2(cfg.config_path, cfg.checkpoint_path, device=cfg.device)

    @app.get("/health")
    def health() -> JSONResponse:
        return JSONResponse(
            {
                "ok": True,
                "device": cfg.device,
                "checkpoint": cfg.checkpoint_path,
                "config": cfg.config_path,
            }
        )

    @app.post("/sam2/segment")
    def segment(req: SegmentRequest) -> Response:
        image = image_from_data_url(req.image)
        rgb = pil_to_rgb_numpy(image)
        h, w = rgb.shape[0], rgb.shape[1]

        generator = build_generator(model, req)
        masks = generator.generate(rgb)
        mask_luma = combine_masks(masks, h, w)
        return png_response_from_mask(mask_luma)

    @app.post("/sam2/parts")
    def parts(req: PartsRequest) -> JSONResponse:
        image = image_from_data_url(req.image)
        rgb = pil_to_rgb_numpy(image)
        h, w = rgb.shape[0], rgb.shape[1]
        alpha_mask = alpha_opaque_mask(image)
        opaque_mask = estimate_foreground_mask_from_edges(image, alpha_mask)

        generator = build_generator(model, req)
        masks = generator.generate(rgb)

        character_mask, part_masks, labeled_regions = build_part_masks(
            mask_items=masks,
            height=h,
            width=w,
            max_regions=req.max_regions,
            source_opaque_mask=opaque_mask,
        )
        preview_data_url, parts_data = build_parts_preview(image, character_mask, part_masks)
        regions_preview_data_url, regions_data = build_regions_preview(
            image, character_mask, labeled_regions
        )

        return JSONResponse(
            {
                "ok": True,
                "image_width": w,
                "image_height": h,
                "total_parts": len(parts_data),
                "preview": preview_data_url,
                "regions_preview": regions_preview_data_url,
                "parts": parts_data,
                "regions": regions_data,
            }
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("SAM2_HOST", "127.0.0.1")
    port = int(os.environ.get("SAM2_PORT", "8765"))
    uvicorn.run("server:app", host=host, port=port, reload=False)
