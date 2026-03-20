# Debugging ASL recognition (WLASL I3D)

## Quick checks

1. **Health** — `GET /health` → `model_loaded: true` (not stub).
2. **One clip** — `curl -F "video=@clip.webm" http://localhost:8004/predict | jq`
3. Read **`decision`** and **`alternatives`** in the JSON (not only `transcript`).

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
