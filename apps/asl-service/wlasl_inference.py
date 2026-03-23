"""
WLASL-based ASL recognition helper for TalknShop ASL service.

This module wraps the open-source WLASL I3D model to provide a simple
`recognize(video_bytes) -> (transcript, confidence, provider)` API that can be
called from FastAPI routes.

Design goals:
- Keep the ASL service decoupled from the exact WLASL repo layout.
- Use environment variables for model + class list paths.
- Fail gracefully (raise WLASLInitError) so the service can fall back to stub mode.
"""

from __future__ import annotations

import io
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import numpy as np
import torch
import torch.nn.functional as F

try:
    import cv2  # type: ignore
except Exception as e:  # pragma: no cover - environment-specific
    raise ImportError("opencv-python (cv2) is required for WLASL inference") from e


logger = logging.getLogger(__name__)


class WLASLInitError(RuntimeError):
    """Raised when the WLASL model or its dependencies cannot be initialized."""


STANDARD_RETRY_TRANSCRIPT = (
    "I didn't catch that sign clearly — please try again with a clear, full sign."
)


@dataclass
class ASLRecognitionResult:
    """Structured output from WLASL inference (for API + debugging)."""

    transcript: str
    confidence: float
    provider: str
    alternatives: List[Tuple[str, str, float]]  # (gloss, shopping_query, probability)
    decision: str  # accepted | below_confidence | ambiguous_margin


def _default_wlasl_i3d_dir() -> Path:
    """
    Best-effort default path to the WLASL I3D code directory when the TalknShop
    repo and WLASL repo are checked out side-by-side, as in this project.
    """
    here = Path(__file__).resolve()
    # .../talknshop/apps/asl-service/wlasl_inference.py
    # Go up to repo root that contains both talknshop/ and WLASL/
    repo_root = here.parents[3]
    return repo_root / "WLASL" / "code" / "I3D"


def _import_inception_i3d() -> "type[torch.nn.Module]":
    """
    Import InceptionI3d from the WLASL I3D code.

    We dynamically adjust sys.path so we don't require WLASL to be installed
    as a package. If the path is not found, raise WLASLInitError.
    """
    import importlib
    import sys

    i3d_dir_env = os.getenv("WLASL_I3D_DIR")
    if i3d_dir_env:
        i3d_dir = Path(i3d_dir_env).expanduser().resolve()
    else:
        i3d_dir = _default_wlasl_i3d_dir()

    if not i3d_dir.exists():
        raise WLASLInitError(
            f"WLASL I3D directory not found at {i3d_dir}. "
            "Set WLASL_I3D_DIR or adjust repo layout."
        )

    if str(i3d_dir) not in sys.path:
        sys.path.append(str(i3d_dir))

    try:
        module = importlib.import_module("pytorch_i3d")
    except Exception as e:  # pragma: no cover - import error path
        raise WLASLInitError(
            f"Failed to import pytorch_i3d from {i3d_dir}: {e}"
        ) from e

    if not hasattr(module, "InceptionI3d"):
        raise WLASLInitError("pytorch_i3d.InceptionI3d not found")

    return getattr(module, "InceptionI3d")


def _load_class_list(path: Path) -> List[str]:
    """
    Load WLASL class list mapping from index → gloss.

    Expected format (tab or space separated):
        0    book
        1    drink
        2    computer
        ...
    """
    if not path.exists():
        raise WLASLInitError(f"WLASL class list file not found at {path}")

    idx_to_gloss: List[str] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Split on whitespace; first token is index, rest is gloss
            parts = line.split()
            if len(parts) < 2:
                continue
            gloss = " ".join(parts[1:])
            idx_to_gloss.append(gloss)
    if not idx_to_gloss:
        raise WLASLInitError(f"No classes parsed from {path}")
    return idx_to_gloss


def _write_temp_video(video_bytes: bytes, suffix: str = ".mp4") -> Path:
    """Persist uploaded bytes to a temporary video file for OpenCV."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(video_bytes)
        tmp.flush()
    finally:
        tmp.close()
    return Path(tmp.name)


def _load_rgb_frames_from_video_file(
    video_path: Path,
    max_frames: int = 64,
) -> np.ndarray:
    """
    Load up to max_frames RGB frames from a video file and normalize them.

    Output shape: (T, H, W, C) with values in [-1, 1].
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video file: {video_path}")

    frames: list[np.ndarray] = []
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0:
        # Some containers/codecs report 0 frame count; try reading until we get a few frames
        for _ in range(128):
            ret, frame = cap.read()
            if not ret:
                break
            img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            h, w, _ = img.shape
            scale = 256.0 / min(h, w)
            new_h, new_w = int(round(h * scale)), int(round(w * scale))
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            top = max(0, (new_h - 224) // 2)
            left = max(0, (new_w - 224) // 2)
            img = img[top : top + 224, left : left + 224]
            img = (img / 255.0) * 2.0 - 1.0
            frames.append(img.astype(np.float32))
            if len(frames) >= 64:
                break
        cap.release()
        if not frames:
            raise RuntimeError(f"Video has no readable frames: {video_path}")
        arr = np.stack(frames, axis=0)
        if arr.shape[0] < 2:
            arr = np.repeat(arr, 2, axis=0)
        if arr.shape[0] < 64:
            arr = np.tile(arr, ((64 + arr.shape[0] - 1) // arr.shape[0], 1, 1, 1))[:64]
        return arr

    # Sample up to max_frames frames uniformly across the video.
    indices = (
        np.linspace(0, max(0, total - 1), num=min(max_frames, total))
        .astype(int)
        .tolist()
    )

    current_idx = 0
    frame_pos = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_pos == indices[current_idx]:
            # Convert BGR (OpenCV default) → RGB
            img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            h, w, _ = img.shape

            # Shorter side to 256, preserve aspect.
            scale = 256.0 / min(h, w)
            new_h, new_w = int(round(h * scale)), int(round(w * scale))
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

            # Center crop 224x224
            top = max(0, (new_h - 224) // 2)
            left = max(0, (new_w - 224) // 2)
            img = img[top : top + 224, left : left + 224]

            # Normalize to [-1, 1] as in WLASL code.
            img = (img / 255.0) * 2.0 - 1.0

            frames.append(img.astype(np.float32))
            current_idx += 1
            if current_idx >= len(indices):
                break
        frame_pos += 1

    cap.release()

    if not frames:
        raise RuntimeError(f"No frames loaded from video: {video_path}")

    arr = np.stack(frames, axis=0)  # (T, 224, 224, 3)

    # I3D's final AvgPool3d has kernel (2, 7, 7) — need T >= 2. WLASL training uses 64 frames.
    min_frames = 2
    target_frames = 64
    T = arr.shape[0]
    if T < min_frames:
        # Repeat the single frame to avoid RuntimeError: input (T:1) smaller than kernel (kT:2)
        arr = np.repeat(arr, min_frames, axis=0)
        T = min_frames
    if T < target_frames:
        # Pad by repeating the sequence so the model sees the expected temporal length
        repeats = (target_frames + T - 1) // T
        arr = np.tile(arr, (repeats, 1, 1, 1))[:target_frames]
    return arr


def _video_to_tensor(frames: np.ndarray) -> torch.Tensor:
    """
    Convert numpy video array (T, H, W, C) to torch tensor (1, C, T, H, W).
    """
    # (T, H, W, C) → (C, T, H, W)
    tensor = torch.from_numpy(frames.transpose(3, 0, 1, 2))  # type: ignore[arg-type]
    return tensor.unsqueeze(0).float()


@dataclass
class WLASLConfig:
    weights_path: Path
    class_list_path: Path
    device: str = "cpu"
    confidence_threshold: float = 0.35
    # Require (p_top1 - p_top2) >= this to accept top-1 (reduces book vs clothes flips)
    min_top_margin: float = 0.06
    # How many alternatives to attach to the API response
    alternatives_k: int = 8
    # Pool logits over time: "mean" (default) or "max" (closer to some WLASL test code)
    logit_agg: str = "mean"


class WLASLRecognizer:
    """
    Thin wrapper around the WLASL I3D model for single-video inference.

    Usage:
        recognizer = WLASLRecognizer.from_env()
        transcript, confidence, provider = recognizer.recognize(video_bytes, content_type)
    """

    def __init__(self, config: WLASLConfig) -> None:
        InceptionI3d = _import_inception_i3d()

        if not config.weights_path.exists():
            raise WLASLInitError(f"WLASL weights not found at {config.weights_path}")

        self.device = torch.device(config.device)
        self.idx_to_gloss = _load_class_list(config.class_list_path)
        self.confidence_threshold = config.confidence_threshold
        self.min_top_margin = config.min_top_margin
        self.alternatives_k = config.alternatives_k
        self.logit_agg = config.logit_agg
        num_classes = len(self.idx_to_gloss)

        logger.info(
            "Initializing WLASL I3D model: weights=%s classes=%d device=%s",
            config.weights_path,
            num_classes,
            self.device,
        )

        self.model = InceptionI3d(num_classes=num_classes, in_channels=3)
        state = torch.load(config.weights_path, map_location=self.device)
        # Some checkpoints might be wrapped with 'module.' prefixes; handle both.
        if any(k.startswith("module.") for k in state.keys()):
            # Strip 'module.' prefixes
            new_state = {}
            for k, v in state.items():
                new_state[k.replace("module.", "", 1)] = v
            state = new_state

        self.model.load_state_dict(state, strict=False)
        self.model.to(self.device)
        self.model.eval()

    @classmethod
    def from_env(cls) -> "WLASLRecognizer":
        """
        Build config from environment variables:

        - ASL_MODEL_PATH: path to WLASL I3D checkpoint (.pt)
        - ASL_CLASS_LIST_PATH: path to wlasl_class_list.txt
        - ASL_DEVICE: 'cpu' (default) or 'cuda'
        - ASL_CONFIDENCE_THRESHOLD: min confidence (0-1) to return a gloss; below this return a retry message (default 0.35)
        - ASL_MIN_TOP_MARGIN: min gap between top-1 and top-2 softmax prob to accept (default 0.06)
        - ASL_ALTERNATIVES_K: number of alternative glosses in API (default 8)
        - ASL_LOGIT_AGG: mean or max over time dimension for I3D logits (default mean)
        """
        weights_env = os.getenv("ASL_MODEL_PATH")
        if not weights_env:
            raise WLASLInitError("ASL_MODEL_PATH is not set")

        weights_path = Path(weights_env).expanduser().resolve()

        class_list_env = os.getenv("ASL_CLASS_LIST_PATH")
        if class_list_env:
            class_list_path = Path(class_list_env).expanduser().resolve()
        else:
            # Default to WLASL repo side-by-side layout:
            # repo_root/WLASL/code/I3D/preprocess/wlasl_class_list.txt
            class_list_path = _default_wlasl_i3d_dir() / "preprocess" / "wlasl_class_list.txt"

        device = os.getenv("ASL_DEVICE", "cpu")

        try:
            th = float(os.getenv("ASL_CONFIDENCE_THRESHOLD", "0.35"))
            confidence_threshold = max(0.0, min(1.0, th))
        except (TypeError, ValueError):
            confidence_threshold = 0.35

        try:
            margin = float(os.getenv("ASL_MIN_TOP_MARGIN", "0.06"))
            min_top_margin = max(0.0, min(1.0, margin))
        except (TypeError, ValueError):
            min_top_margin = 0.06

        try:
            ak = int(os.getenv("ASL_ALTERNATIVES_K", "8"))
            # Allow up to 100 so curl/jq can inspect top-50; very large lists cost little extra.
            alternatives_k = max(2, min(100, ak))
        except (TypeError, ValueError):
            alternatives_k = 8

        logit_agg = (os.getenv("ASL_LOGIT_AGG", "mean") or "mean").strip().lower()
        if logit_agg not in ("mean", "max"):
            logit_agg = "mean"

        config = WLASLConfig(
            weights_path=weights_path,
            class_list_path=class_list_path,
            device=device,
            confidence_threshold=confidence_threshold,
            min_top_margin=min_top_margin,
            alternatives_k=alternatives_k,
            logit_agg=logit_agg,
        )
        return cls(config)

    def recognize(self, video_bytes: bytes, content_type: str | None = None) -> ASLRecognitionResult:
        """
        Run WLASL I3D on the given video bytes and return ASLRecognitionResult
        (transcript, confidence, provider, ranked alternatives, decision tag).
        """
        # Persist to temp file for OpenCV.
        suffix = ".mp4"
        if content_type:
            if "webm" in content_type:
                suffix = ".webm"
            elif "quicktime" in content_type or "mov" in content_type:
                suffix = ".mov"

        tmp_path = _write_temp_video(video_bytes, suffix=suffix)
        try:
            frames = _load_rgb_frames_from_video_file(tmp_path, max_frames=64)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)  # type: ignore[call-arg]
            except Exception:
                pass

        clip = _video_to_tensor(frames).to(self.device)  # (1, C, T, H, W)

        with torch.no_grad():
            logits = self.model(clip)  # type: ignore[call-arg]
            # Different I3D forks expose either (B, T, C) or (B, C, T).
            # We detect where the class dimension is (matches class-list size)
            # and pool only along the temporal axis.
            if logits.ndim == 3:
                # Remove batch dim (B=1): shape is either (T, C) or (C, T)
                logits_2d = logits[0]
                num_classes = len(self.idx_to_gloss)

                if logits_2d.shape[0] == num_classes and logits_2d.shape[1] != num_classes:
                    # (C, T) -> pool over T (dim=1)
                    if self.logit_agg == "max":
                        logits_agg = logits_2d.max(dim=1)[0]
                    else:
                        logits_agg = logits_2d.mean(dim=1)
                elif logits_2d.shape[1] == num_classes and logits_2d.shape[0] != num_classes:
                    # (T, C) -> pool over T (dim=0)
                    if self.logit_agg == "max":
                        logits_agg = logits_2d.max(dim=0)[0]
                    else:
                        logits_agg = logits_2d.mean(dim=0)
                else:
                    # Defensive fallback: assume larger axis is class axis, pool the other.
                    class_axis = 0 if logits_2d.shape[0] >= logits_2d.shape[1] else 1
                    time_axis = 1 - class_axis
                    if self.logit_agg == "max":
                        logits_agg = logits_2d.max(dim=time_axis)[0]
                    else:
                        logits_agg = logits_2d.mean(dim=time_axis)
                    logger.warning(
                        "Ambiguous logits layout %s; inferred class_axis=%d time_axis=%d",
                        tuple(logits_2d.shape),
                        class_axis,
                        time_axis,
                    )
            elif logits.ndim == 2:
                # (B, C)
                logits_agg = logits[0]
            else:  # pragma: no cover - defensive
                logits_agg = logits.view(-1)

            probs = F.softmax(logits_agg, dim=0)

        k = max(self.alternatives_k, 5)
        top_probs, top_indices = torch.topk(probs, min(k, probs.shape[0]))
        top_p_list = top_probs.cpu().tolist()
        top_i_list = top_indices.cpu().tolist()
        alternatives: List[Tuple[str, str, float]] = []
        for i, p in zip(top_i_list, top_p_list):
            g = self.idx_to_gloss[i] if 0 <= i < len(self.idx_to_gloss) else f"class_{i}"
            q = self._gloss_to_query(g)
            alternatives.append((g, q, float(p)))
        alternatives = alternatives[: self.alternatives_k]

        confidence = float(top_p_list[0])
        gloss = alternatives[0][0] if alternatives else ""

        logger.info(
            "WLASL top-%d: %s",
            min(5, len(alternatives)),
            ", ".join(f"{g}={p:.3f}" for g, _, p in alternatives[:5]),
        )

        p2 = float(top_p_list[1]) if len(top_p_list) > 1 else 0.0
        margin = confidence - p2

        # Reject low overall confidence
        if confidence < self.confidence_threshold:
            logger.info(
                "Confidence %.3f below threshold %.3f; decision=below_confidence top_gloss=%r",
                confidence,
                self.confidence_threshold,
                gloss,
            )
            return ASLRecognitionResult(
                transcript=STANDARD_RETRY_TRANSCRIPT,
                confidence=confidence,
                provider="wlasl-i3d",
                alternatives=alternatives,
                decision="below_confidence",
            )

        # Reject ambiguous top-1 vs top-2 (e.g. clothes=0.18, book=0.17)
        if margin < self.min_top_margin:
            logger.info(
                "Top margin %.3f < min_top_margin %.3f (p1=%.3f p2=%.3f); decision=ambiguous_margin top=%r runner_up=%r",
                margin,
                self.min_top_margin,
                confidence,
                p2,
                gloss,
                alternatives[1][0] if len(alternatives) > 1 else None,
            )
            return ASLRecognitionResult(
                transcript=STANDARD_RETRY_TRANSCRIPT,
                confidence=confidence,
                provider="wlasl-i3d",
                alternatives=alternatives,
                decision="ambiguous_margin",
            )

        transcript = self._gloss_to_query(gloss)
        return ASLRecognitionResult(
            transcript=transcript,
            confidence=confidence,
            provider="wlasl-i3d",
            alternatives=alternatives,
            decision="accepted",
        )

    @staticmethod
    def _gloss_to_query(gloss: str) -> str:
        """
        Convert a WLASL gloss (e.g., 'computer') to a natural-language shopping query.

        For this project we mostly sign product names; returning the gloss directly
        works well as a search query. A few hand-tuned mappings can be added here
        (e.g., 'computer' → 'laptop').
        """
        g = gloss.strip().lower()
        synonym_map = {
            "computer": "laptop",
            "cellphone": "phone",
            "telephone": "phone",
            "tv": "television",
        }
        return synonym_map.get(g, g)

