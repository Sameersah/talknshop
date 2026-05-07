#!/usr/bin/env bash
# Copy video clips into numbered filenames for MediaPipe enrollment:
#   label_1.mov, label_2.mp4, ...
#
# Usage:
#   ./scripts/number_asl_clips.sh <label> <input_folder> [output_folder]
#
# Example:
#   ./scripts/number_asl_clips.sh book ~/Downloads/book_raw clips/book
#
# Defaults output to ./videos/enrollment/<label>/ (created if missing).
set -euo pipefail

LABEL="${1:?Usage: $0 <label> <input_folder> [output_folder]}"
INPUT="${2:?Usage: $0 <label> <input_folder> [output_folder]}"
OUT="${3:-videos/enrollment/${LABEL}}"

if [[ ! -d "$INPUT" ]]; then
  echo "error: not a directory: $INPUT" >&2
  exit 1
fi

mkdir -p "$OUT"

shopt -s nullglob
mapfile -t FILES < <(find "$INPUT" -maxdepth 1 -type f \( \
  -iname '*.mov' -o -iname '*.mp4' -o -iname '*.webm' \) | LC_ALL=C sort)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "error: no .mov/.mp4/.webm files in $INPUT" >&2
  exit 1
fi

i=1
for f in "${FILES[@]}"; do
  ext="${f##*.}"
  ext_lower=$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')
  dest="$OUT/${LABEL}_${i}.${ext_lower}"
  cp "$f" "$dest"
  echo "$dest"
  i=$((i + 1))
done

echo "done: wrote $((i - 1)) file(s) under $OUT"
