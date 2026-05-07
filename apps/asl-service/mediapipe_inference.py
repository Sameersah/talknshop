"""
MediaPipe-based ASL recognizer with template matching.

This module provides a practical same-day path for live recording accuracy:
- Extract hand landmarks using MediaPipe
- Build per-label templates from enrolled videos
- Match incoming videos with DTW distance

It is domain-adaptable for TalknShop because the team can enroll shopping signs
such as "shoes", "laptop", "phone", etc., without training a deep model first.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import cv2  # type: ignore
import mediapipe as mp  # type: ignore
import numpy as np

from video_compat import prepare_video_for_opencv
from wlasl_inference import STANDARD_RETRY_TRANSCRIPT

logger = logging.getLogger(__name__)


@dataclass
class MediaPipeRecognitionResult:
    transcript: str
    confidence: float
    provider: str
    alternatives: List[Tuple[str, str, float]]  # (label, query, confidence)
    decision: str  # accepted | below_confidence | no_templates | no_hands


@dataclass
class MediaPipeConfig:
    templates_dir: Path
    confidence_threshold: float = 0.40
    max_num_hands: int = 2
    min_detection_confidence: float = 0.5
    min_tracking_confidence: float = 0.5
    # Softmax only over the K nearest templates by DTW (avoids spreading mass across every label).
    softmax_top_k: int = 8
    # Accept best label when 2nd-place DTW is sufficiently worse than 1st (scale-free).
    rel_margin_accept: float = 0.10


def _gloss_to_query(gloss: str) -> str:
    g = gloss.strip().lower()
    synonym_map = {
        "computer": "laptop",
        "cellphone": "phone",
        "telephone": "phone",
        "tv": "television",
        "clothes": "clothing",
        "shoe": "shoes",
        "sneaker": "shoes",
        "drink": "water bottle",
    }
    return synonym_map.get(g, g)


def _normalize_hand(hand_xyz: np.ndarray) -> np.ndarray:
    """Normalize one hand landmarks array (21,3) by wrist-centered scaling."""
    wrist = hand_xyz[0]
    centered = hand_xyz - wrist
    scale = float(np.max(np.linalg.norm(centered[:, :2], axis=1)))
    if scale < 1e-6:
        scale = 1.0
    return centered / scale


def _dtw_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Simple DTW for 2D arrays: a=(Ta,D), b=(Tb,D)."""
    ta, _ = a.shape
    tb, _ = b.shape
    dp = np.full((ta + 1, tb + 1), np.inf, dtype=np.float64)
    dp[0, 0] = 0.0
    for i in range(1, ta + 1):
        ai = a[i - 1]
        for j in range(1, tb + 1):
            cost = float(np.linalg.norm(ai - b[j - 1]))
            dp[i, j] = cost + min(dp[i - 1, j], dp[i, j - 1], dp[i - 1, j - 1])
    denom = float(max(ta, tb))
    return float(dp[ta, tb] / max(denom, 1.0))


class MediaPipeTemplateRecognizer:
    def __init__(self, config: MediaPipeConfig) -> None:
        self.config = config
        self.config.templates_dir.mkdir(parents=True, exist_ok=True)
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=config.max_num_hands,
            min_detection_confidence=config.min_detection_confidence,
            min_tracking_confidence=config.min_tracking_confidence,
        )
        logger.info("MediaPipe recognizer initialized; templates_dir=%s", self.config.templates_dir)

    @classmethod
    def from_env(cls) -> "MediaPipeTemplateRecognizer":
        td = Path(os.getenv("ASL_MEDIAPIPE_TEMPLATES_DIR", "/app/mediapipe_templates")).expanduser().resolve()
        try:
            th = float(os.getenv("ASL_MEDIAPIPE_CONFIDENCE_THRESHOLD", "0.40"))
            threshold = max(0.0, min(1.0, th))
        except (TypeError, ValueError):
            threshold = 0.40
        try:
            sk = int(os.getenv("ASL_MEDIAPIPE_SOFTMAX_TOP_K", "8"))
            softmax_top_k = max(2, min(50, sk))
        except (TypeError, ValueError):
            softmax_top_k = 8
        try:
            rm = float(os.getenv("ASL_MEDIAPIPE_REL_MARGIN_ACCEPT", "0.10"))
            rel_margin_accept = max(0.0, min(2.0, rm))
        except (TypeError, ValueError):
            rel_margin_accept = 0.10
        cfg = MediaPipeConfig(
            templates_dir=td,
            confidence_threshold=threshold,
            max_num_hands=2,
            min_detection_confidence=float(os.getenv("ASL_MEDIAPIPE_MIN_DET_CONF", "0.5")),
            min_tracking_confidence=float(os.getenv("ASL_MEDIAPIPE_MIN_TRACK_CONF", "0.5")),
            softmax_top_k=softmax_top_k,
            rel_margin_accept=rel_margin_accept,
        )
        return cls(cfg)

    def _decode_landmark_sequence(self, video_path: Path, max_frames: int = 180) -> np.ndarray:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        sequence: List[np.ndarray] = []
        read_count = 0
        while read_count < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            read_count += 1
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            out = self._hands.process(rgb)

            # Feature vector: left hand (21*3) + right hand (21*3) = 126 dims
            left = np.zeros((21, 3), dtype=np.float32)
            right = np.zeros((21, 3), dtype=np.float32)
            if out.multi_hand_landmarks and out.multi_handedness:
                for hand_lm, hand_handed in zip(out.multi_hand_landmarks, out.multi_handedness):
                    xyz = np.array([[lm.x, lm.y, lm.z] for lm in hand_lm.landmark], dtype=np.float32)
                    xyz = _normalize_hand(xyz)
                    label = hand_handed.classification[0].label.lower()  # "left" / "right"
                    if label == "left":
                        left = xyz
                    else:
                        right = xyz
            feat = np.concatenate([left.reshape(-1), right.reshape(-1)], axis=0)
            sequence.append(feat)

        cap.release()
        if not sequence:
            return np.zeros((0, 126), dtype=np.float32)
        seq = np.stack(sequence, axis=0).astype(np.float32)
        # Keep only frames where at least one hand is present (non-zero landmarks)
        mask = np.linalg.norm(seq, axis=1) > 1e-5
        seq = seq[mask]
        return seq

    def _template_path(self, label: str) -> Path:
        safe = "".join(ch for ch in label.lower().strip() if ch.isalnum() or ch in ("_", "-"))
        if not safe:
            raise ValueError("Invalid label")
        return self.config.templates_dir / f"{safe}.json"

    def _load_templates(self) -> dict[str, List[np.ndarray]]:
        templates: dict[str, List[np.ndarray]] = {}
        for p in sorted(self.config.templates_dir.glob("*.json")):
            try:
                data = json.loads(p.read_text())
                label = str(data.get("label", p.stem))
                seqs = []
                for s in data.get("sequences", []):
                    arr = np.asarray(s, dtype=np.float32)
                    if arr.ndim == 2 and arr.shape[1] == 126 and arr.shape[0] >= 4:
                        seqs.append(arr)
                if seqs:
                    templates[label] = seqs
            except Exception as e:
                logger.warning("Skipping bad template file %s: %s", p, e)
        return templates

    def enroll(self, video_bytes: bytes, label: str, content_type: str | None = None) -> dict:
        tmp_path, cleanup_paths = prepare_video_for_opencv(video_bytes, content_type)
        try:
            seq = self._decode_landmark_sequence(tmp_path)
        finally:
            for p in cleanup_paths:
                try:
                    p.unlink(missing_ok=True)  # type: ignore[call-arg]
                except Exception:
                    pass

        if seq.shape[0] < 4:
            raise RuntimeError("Could not extract enough hand landmarks from video")

        path = self._template_path(label)
        if path.exists():
            data = json.loads(path.read_text())
        else:
            data = {"label": label.lower().strip(), "sequences": []}
        data["sequences"].append(seq.tolist())
        # Keep latest 20 examples per label to bound file size
        data["sequences"] = data["sequences"][-20:]
        path.write_text(json.dumps(data))
        return {
            "label": data["label"],
            "samples_count": len(data["sequences"]),
            "frames_in_sample": int(seq.shape[0]),
            "template_file": str(path),
        }

    def recognize(self, video_bytes: bytes, content_type: str | None = None) -> MediaPipeRecognitionResult:
        templates = self._load_templates()
        if not templates:
            return MediaPipeRecognitionResult(
                transcript=STANDARD_RETRY_TRANSCRIPT,
                confidence=0.0,
                provider="mediapipe-template",
                alternatives=[],
                decision="no_templates",
            )

        tmp_path, cleanup_paths = prepare_video_for_opencv(video_bytes, content_type)
        try:
            seq = self._decode_landmark_sequence(tmp_path)
        finally:
            for p in cleanup_paths:
                try:
                    p.unlink(missing_ok=True)  # type: ignore[call-arg]
                except Exception:
                    pass

        if seq.shape[0] < 4:
            return MediaPipeRecognitionResult(
                transcript=STANDARD_RETRY_TRANSCRIPT,
                confidence=0.0,
                provider="mediapipe-template",
                alternatives=[],
                decision="no_hands",
            )

        # Best DTW distance per label
        label_dist: list[tuple[str, float]] = []
        for label, examples in templates.items():
            d = min(_dtw_distance(seq, ex) for ex in examples)
            label_dist.append((label, float(d)))
        label_dist.sort(key=lambda x: x[1])

        dvals = np.array([d for _, d in label_dist], dtype=np.float64)
        k_soft = min(max(self.config.softmax_top_k, 2), len(dvals))
        d_top = dvals[:k_soft]
        scale = max(float(np.std(d_top)), 1e-3)
        scores_k = np.exp(-(d_top / scale))
        sum_k = float(scores_k.sum())
        probs_k = scores_k / max(sum_k, 1e-12)

        alternatives: List[Tuple[str, str, float]] = []
        for i in range(min(8, len(label_dist))):
            label = label_dist[i][0]
            if i < k_soft:
                p = float(probs_k[i])
            else:
                p = float(probs_k[-1]) * (0.25 ** (i - k_soft + 1))
            alternatives.append((label, _gloss_to_query(label), p))

        top_label = alternatives[0][0]
        top_query = alternatives[0][1]
        top_conf = alternatives[0][2]

        d1 = float(dvals[0])
        d2 = float(dvals[1]) if len(dvals) > 1 else d1 + 1.0
        rel_margin = (d2 - d1) / max(d1, 1e-6)
        margin_ok = rel_margin >= self.config.rel_margin_accept
        prob_ok = top_conf >= self.config.confidence_threshold

        if margin_ok and not prob_ok:
            logger.info(
                "MediaPipe accepted via DTW margin (rel_margin=%.4f >= %.4f); top=%s",
                rel_margin,
                self.config.rel_margin_accept,
                top_label,
            )

        if not prob_ok and not margin_ok:
            return MediaPipeRecognitionResult(
                transcript=STANDARD_RETRY_TRANSCRIPT,
                confidence=top_conf,
                provider="mediapipe-template",
                alternatives=alternatives[:8],
                decision="below_confidence",
            )

        out_conf = top_conf if prob_ok else min(1.0, max(top_conf, 0.35 + 0.15 * min(rel_margin / max(self.config.rel_margin_accept, 1e-6), 2.0)))

        return MediaPipeRecognitionResult(
            transcript=top_query,
            confidence=out_conf,
            provider="mediapipe-template",
            alternatives=alternatives[:8],
            decision="accepted",
        )
