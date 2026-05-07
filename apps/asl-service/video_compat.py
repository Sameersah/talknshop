"""
Decode helpers: OpenCV in slim Docker images often cannot open WebM/VP9.
Transcode with ffmpeg to H.264 MP4 when VideoCapture fails.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2  # type: ignore

logger = logging.getLogger(__name__)

_FFMPEG_ERR_HINTS = (
    "error",
    "invalid",
    "failed",
    "matroska",
    "ebml",
    "end of file",
    "eof",
    "cannot",
    "opening input",
    "no such file",
)


def _ffmpeg_stderr_for_log(stderr: str, max_len: int = 1200) -> str:
    """Prefer ffmpeg diagnostic lines; avoid logging only the build-config banner tail."""
    if not stderr or not stderr.strip():
        return "(no stderr)"
    lines = [ln.strip() for ln in stderr.splitlines() if ln.strip()]
    interesting = [
        ln
        for ln in lines
        if any(h in ln.lower() for h in _FFMPEG_ERR_HINTS)
    ]
    out_lines = interesting if interesting else lines[-12:]
    text = "\n".join(out_lines)
    if len(text) > max_len:
        return text[-max_len:]
    return text


def _sniff_container(video_bytes: bytes) -> str:
    """Guess file extension from magic bytes when Content-Type is wrong or missing."""
    if len(video_bytes) < 12:
        return ".mp4"
    if video_bytes[4:8] == b"ftyp":
        return ".mp4"
    if video_bytes[:4] == b"\x1a\x45\xdf\xa3":  # EBML (WebM/MKV)
        return ".webm"
    if video_bytes[4:8] in (b"moov", b"mdat", b"wide", b"free"):
        return ".mov"
    return ".mp4"


def _suffix_from_content_type(content_type: str | None, video_bytes: bytes) -> str:
    ct = (content_type or "").lower()
    if "webm" in ct:
        return ".webm"
    if "quicktime" in ct or "mov" in ct:
        return ".mov"
    if not ct or ct == "application/octet-stream":
        return _sniff_container(video_bytes)
    return ".mp4"


def _write_temp_video(video_bytes: bytes, suffix: str) -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(video_bytes)
        tmp.flush()
    finally:
        tmp.close()
    return Path(tmp.name)


def _cv2_can_read(path: Path) -> bool:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            return False
        ok, frame = cap.read()
        return bool(ok and frame is not None)
    finally:
        cap.release()


def _run_ffmpeg_h264(src: Path, dst: Path, *, tolerant: bool) -> tuple[bool, str]:
    """
    Run ffmpeg to H.264 MP4. Returns (ok, stderr_tail_for_logging).
    tolerant=True uses flags that sometimes recover incomplete browser WebM.
    """
    pre = [
        "ffmpeg",
        "-y",
    ]
    if tolerant:
        pre.extend(
            [
                "-fflags",
                "+genpts+discardcorrupt",
                "-err_detect",
                "ignore_err",
                "-probesize",
                "50M",
                "-analyzeduration",
                "10M",
            ]
        )
    cmd = pre + [
        "-i",
        str(src),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-an",
        str(dst),
    ]
    try:
        r = subprocess.run(
            cmd, check=True, capture_output=True, text=True, timeout=180
        )
        return True, _ffmpeg_stderr_for_log(r.stderr or "")
    except subprocess.CalledProcessError as e:
        err = _ffmpeg_stderr_for_log((e.stderr or e.stdout or ""))
        return False, err
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return False, str(e)


def _ffmpeg_to_h264_mp4(src: Path) -> Path | None:
    if not shutil.which("ffmpeg"):
        logger.warning("ffmpeg not found; cannot transcode %s", src)
        return None
    dst = Path(tempfile.mktemp(suffix=".mp4"))
    ok, err_tail = _run_ffmpeg_h264(src, dst, tolerant=False)
    if not ok:
        logger.warning(
            "ffmpeg transcode failed for %s (strict): %s", src, err_tail or "(no stderr)"
        )
        try:
            dst.unlink(missing_ok=True)  # type: ignore[call-arg]
        except Exception:
            pass
        dst = Path(tempfile.mktemp(suffix=".mp4"))
        ok, err_tail = _run_ffmpeg_h264(src, dst, tolerant=True)
        if not ok:
            logger.warning(
                "ffmpeg transcode failed for %s (tolerant): %s", src, err_tail or "(no stderr)"
            )
            try:
                dst.unlink(missing_ok=True)  # type: ignore[call-arg]
            except Exception:
                pass
            return None
    if _cv2_can_read(dst):
        return dst
    try:
        dst.unlink(missing_ok=True)  # type: ignore[call-arg]
    except Exception:
        pass
    return None


def prepare_video_for_opencv(video_bytes: bytes, content_type: str | None) -> tuple[Path, list[Path]]:
    """
    Write bytes to a temp file. If OpenCV cannot decode it, transcode to MP4 with ffmpeg.

    Returns:
        (path_to_use, all_temp_paths_to_delete_in_finally)
    """
    suffix = _suffix_from_content_type(content_type, video_bytes)
    primary = _write_temp_video(video_bytes, suffix=suffix)
    cleanup: list[Path] = [primary]

    if _cv2_can_read(primary):
        return primary, cleanup

    logger.info("OpenCV cannot read %s (suffix=%s); trying ffmpeg", primary, suffix)
    mp4 = _ffmpeg_to_h264_mp4(primary)
    if mp4 is not None:
        cleanup.append(mp4)
        return mp4, cleanup

    raise RuntimeError(
        f"Cannot decode video: OpenCV failed on {primary} and ffmpeg transcode failed or is missing"
    )
