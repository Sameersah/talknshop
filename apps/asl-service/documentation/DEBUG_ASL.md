# Debugging ASL recognition (WLASL I3D)

## WebM recordings failing with “Failed to open video file”

Browsers often upload **`video/webm`**. OpenCV in slim Docker images may not decode VP8/VP9. The service now **transcodes with ffmpeg** to H.264 MP4 when OpenCV fails. Rebuild the ASL image after pulling updates so **ffmpeg** is installed (`docker compose build --no-cache asl-service`).

## Quick checks

1. **Health** — `GET /health` → `model_loaded: true` (not stub).
2. **One clip** — `curl -F "video=@clip.webm" http://localhost:8004/predict | jq`
3. Read **`decision`** and **`alternatives`** in the JSON (not only `transcript`).
4. **MediaPipe enrollments** — `GET http://localhost:8004/mediapipe/status` → check `templates_dir`, `labels`, and `samples_per_label`. If `labels` is empty after you enrolled, templates are not on disk where you think (wrong process or volume).

## MediaPipe templates disappear after rebuild

Enrollments are JSON files under `ASL_MEDIAPIPE_TEMPLATES_DIR` (default `/app/mediapipe_templates` in Docker). Without a **host volume**, a new container has an empty folder, so `/predict` falls back to WLASL.

**Fix:** run Compose from the **talknshop repo root** so `docker-compose.yml` mounts `./apps/asl-service/mediapipe_templates:/app/mediapipe_templates`. After each enroll, confirm files on your Mac:

```bash
ls apps/asl-service/mediapipe_templates
```

**Do not** run a second ASL process on port 8004 (e.g. local `uvicorn` and Docker at once). Enroll to one, predict to the other, and templates will not match.

**If you run ASL with `uvicorn` on the host** (not Docker), set in `.env`:

`ASL_MEDIAPIPE_TEMPLATES_DIR=/absolute/path/to/talknshop/apps/asl-service/mediapipe_templates`
(`/app/...` does not exist on macOS.)

## Batch rename clips for enrollment

From repo root, copy all `.mov`/`.mp4`/`.webm` in a folder into numbered names:

```bash
chmod +x scripts/number_asl_clips.sh
./scripts/number_asl_clips.sh book ~/Downloads/book_raw_clips
```

Output defaults to `videos/enrollment/book/` (under `.gitignore`). Pass a third path to choose another output directory.

## Response fields

| Field | Meaning |
|--------|---------|
| `transcript` | Text sent to the chat / catalog (product query or retry message). |
| `confidence` | Softmax probability of the top gloss (0–1). |
| `decision` | `accepted` — used top-1. `below_confidence` — top-1 below threshold. `ambiguous_margin` — top-1 and top-2 too close. |
| `alternatives` | Top-k `(gloss, query, confidence)` — use to see if the sign you meant is rank 2 or 3. |

## Tune env (`.env`)

| Variable | Default | Effect |
|----------|---------|--------|
| `ASL_CONFIDENCE_THRESHOLD` | `0.35` | Higher → more “try again”, fewer weak wrong products. |
| `ASL_MIN_TOP_MARGIN` | `0.06` | Min gap `p1 - p2`; if top two are neck-and-neck, reject (book vs clothes). |
| `ASL_ALTERNATIVES_K` | `8` | How many candidates appear in `alternatives` (max **100**; restart service after changing). |

**`jq '.alternatives[:50]'` only shows up to how many the API returned** — e.g. default `8` means ~8 objects, not 50. Set `ASL_ALTERNATIVES_K=50` and restart.
| `ASL_LOGIT_AGG` | `mean` | `max` pools time like some WLASL test scripts—try both on your clips. |

## Interpretation

- **Wrong product but `book` is 2nd in `alternatives`** → model confusion; improve lighting, framing, slower sign, or lower margin slightly if your clips are always fuzzy.
- **Always `below_confidence`** → threshold too high or video/domain mismatch; lower threshold slightly or fix capture.
- **Always `ambiguous_margin`** → top-2 are tied; increase `ASL_MIN_TOP_MARGIN` for stricter acceptance, or shorten clip to one clear holding of the sign.

## “Perfect” in production

WLASL on webcam is out-of-domain; true gains need **finetuning**, **more controlled capture**, or a **commercial ASL API**. This service gives **transparent metrics** (`alternatives`, `decision`) so you can tune thresholds and demo honestly.
