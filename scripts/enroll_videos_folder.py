#!/usr/bin/env python3
"""
Enroll every video in a folder into MediaPipe ASL templates (POST /mediapipe/enroll).

Label is derived from the filename: strips extensions, test_/wlasl_sample_ prefixes,
and trailing numbers (e.g. laptop2 -> laptop, shoes_1 -> shoes).

Skips files whose label would be empty or look like random ids (no letters).

Usage:
  python3 scripts/enroll_videos_folder.py [videos_dir] [asl_base_url]

Example:
  python3 scripts/enroll_videos_folder.py videos http://localhost:8004
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

VIDEO_EXT = {".mov", ".mp4", ".webm", ".m4v"}


def full_stem(path: Path) -> str:
    """Handle double extensions like file.mp4.mov."""
    s = path.name
    for _ in range(5):
        s2 = Path(s).stem
        if s2 == s:
            break
        s = s2
    return s


def label_from_filename(path: Path) -> str | None:
    stem = full_stem(path)
    # Likely YouTube-style ids, not product labels
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", stem):
        return None
    s = stem.lower().strip()
    s = re.sub(r"^test_", "", s)
    s = re.sub(r"^wlasl_sample_", "", s)
    s = re.sub(r"_\d+$", "", s)
    s = re.sub(r"\d+$", "", s)
    s = re.sub(r"\s+\d+\s*$", "", s)
    s = s.replace(" ", "")
    s = s.strip(" _-.")
    if not s or len(s) < 2:
        return None
    if re.fullmatch(r"[0-9a-f]{8,}", s):
        return None
    if not re.search(r"[a-z]", s):
        return None
    return s


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    videos_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "videos"
    base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8004"
    base = base.rstrip("/")

    if not videos_dir.is_dir():
        print(f"error: not a directory: {videos_dir}", file=sys.stderr)
        return 1

    files: list[Path] = []
    for p in sorted(videos_dir.iterdir()):
        if not p.is_file():
            continue
        n = p.name.lower()
        if n.endswith((".mov", ".mp4", ".webm", ".m4v")) or n.endswith(".mp4.mov"):
            files.append(p)

    if not files:
        print(f"error: no video files found in {videos_dir}", file=sys.stderr)
        return 1

    ok = 0
    fail = 0
    for p in files:
        label = label_from_filename(p)
        if not label:
            print(f"skip (no label): {p.name}")
            continue
        print(f"enroll label={label!r} file={p.name} ...", flush=True)
        cmd = [
            "curl",
            "-s",
            "-S",
            "-w",
            "\nHTTP:%{http_code}\n",
            "-X",
            "POST",
            f"{base}/mediapipe/enroll?label={label}",
            "-F",
            f"video=@{p}",
        ]
        try:
            out = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except subprocess.TimeoutExpired:
            print(f"  timeout: {p.name}", file=sys.stderr)
            fail += 1
            continue
        text = (out.stdout or "") + (out.stderr or "")
        if out.returncode != 0:
            print(f"  curl error rc={out.returncode}: {text[:500]}", file=sys.stderr)
            fail += 1
            continue
        if '"status": "ok"' in text or '"status":"ok"' in text:
            ok += 1
            print(f"  ok")
        elif "HTTP:200" in text:
            ok += 1
            print(f"  ok")
        else:
            print(f"  failed: {text[:800]}", file=sys.stderr)
            fail += 1

    print(f"\ndone: ok={ok} failed={fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
