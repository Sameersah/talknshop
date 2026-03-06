# TalknShop ASL Integration — Technical Design Document

**Document Title:** American Sign Language (ASL) Input Integration — Technical Design  
**Version:** 1.0  
**Status:** Draft for Review  
**Audience:** Course Professor, Project Stakeholders  
**Related:** [Architecture](ARCHITECTURE.md), [Media Service Design](../apps/media-service/documentation/Media-Service-Design-Spec.md)

---

## Version History

| Version | Date       | Author / Context        | Changes                          |
|---------|------------|--------------------------|----------------------------------|
| 1.0     | Feb 2025   | TalknShop Team           | Initial technical design for ASL integration; Sign-Speak primary, open-source fallback. |

---

## 1. Executive Summary

This document describes the **technical design for integrating American Sign Language (ASL) input** into the TalknShop platform. The goal is to allow Deaf and hard-of-hearing users to interact with the shopping assistant by signing in front of the camera (iOS or web) instead of typing or speaking. The recognized text is then processed by the existing orchestrator and catalog/seller flows unchanged.

The design supports **two implementation paths**:

1. **Primary path:** Use the **Sign-Speak** third-party API for ASL recognition (video → text), pending approval and API access from Sign-Speak. A request has been submitted to Sign-Speak for application verification.
2. **Fallback path:** If Sign-Speak does not respond or does not approve the application, implement ASL recognition using an **open-source model** (e.g., WLASL-based) hosted within the existing Media Service or a dedicated inference component.

The document covers scope, architecture, APIs, data flows, security, client changes, decision criteria, risks, and implementation phases so the approach can be evaluated and approved by the professor and stakeholders.

---

## 2. Goals and Scope

### 2.1 Goals

- **Accessibility:** Enable ASL users to search for products and (in future) list items using sign language as input.
- **Consistency:** Treat ASL-derived text the same as typed or voice-derived text in the orchestrator (no separate workflow).
- **Short-term viability:** Prefer a third-party API (Sign-Speak) for faster delivery; fall back to open-source if API access is not available.
- **Extensibility:** Design the media-service ASL contract so the backend can switch between Sign-Speak and open-source without changing the orchestrator or clients.

### 2.2 In Scope

- ASL **input** only: video → text (ASL recognition). Output (text-to-ASL video) is out of scope for this design.
- Integration with existing **Media Service** (new endpoint and optional provider abstraction).
- **Orchestrator** changes to detect ASL media and call the new media-service ASL endpoint.
- **iOS app** and **web app** changes to capture and upload short ASL video and send it as part of the existing message/media flow.
- Definition of **decision criteria and timeline** for choosing Sign-Speak vs open-source.

### 2.3 Out of Scope

- Text-to-ASL (avatar/video) output.
- Other sign languages (e.g., BSL) beyond ASL for this phase.
- Offline/on-device ASL recognition (all recognition is server-side in this design).

---

## 3. Current System Context

TalknShop is a conversational AI shopping platform with:

- **Clients:** iOS app (Expo/React Native), Web app (React/TypeScript), communicating via **WebSocket** with the orchestrator.
- **Orchestrator Service (port 8000):** FastAPI, LangGraph state machine, AWS Bedrock (Claude), DynamoDB. Handles buyer (search) and seller (listing) flows.
- **Media Service (port 8001):** FastAPI. Today supports **audio** (AWS Transcribe) and **image** (AWS Rekognition, vision LLM) processing. Media is referenced by `MediaType` (already including `VIDEO`) and S3 keys.
- **Catalog Service / Seller Crosspost Service:** Consume structured specs from the orchestrator; no direct ASL dependency.

User input today: **text** (typed), **audio** (transcribed via Media Service), **images** (analyzed via Media Service). This design adds **video** used specifically for ASL recognition, producing text that is then fed into the same conversation pipeline.

---

## 4. ASL Integration Architecture

### 4.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                       │
│  ┌─────────────────┐                    ┌─────────────────┐                 │
│  │   iOS App       │                    │   Web App       │                 │
│  │   - ASL capture │                    │   - ASL capture │                 │
│  │   - Video upload│                    │   - Video upload│                 │
│  └────────┬────────┘                    └────────┬────────┘                 │
│           │                                      │                           │
│           └──────────────────┬───────────────────┘                           │
│                              │ WebSocket + Media Upload (S3 presigned)      │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                    ORCHESTRATOR (Port 8000)                                  │
│  - Receives message with media[] containing video (intent: ASL)             │
│  - Calls Media Service: POST /api/v1/asl/recognize                           │
│  - Injects returned transcript as user message → existing LangGraph flow     │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                    MEDIA SERVICE (Port 8001)                                 │
│  POST /api/v1/asl/recognize                                                 │
│  - Input: video (file or S3 key)                                            │
│  - Provider: Sign-Speak API (primary) OR Open-Source Model (fallback)      │
│  - Output: { transcript: string, confidence?: number }                      │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
         ┌─────────────────────┴─────────────────────┐
         │                                           │
         ▼                                           ▼
┌─────────────────────┐                   ┌─────────────────────┐
│  Sign-Speak API     │                   │  Open-Source Model   │
│  (if approved)      │                   │  (e.g. WLASL-based) │
│  - Video → text     │                   │  - Self-hosted      │
└─────────────────────┘                   └─────────────────────┘
```

### 4.2 Component Responsibilities

| Component        | Responsibility |
|-----------------|----------------|
| **iOS / Web**   | Record short ASL video; upload to S3 via existing presigned URL flow; send WebSocket message with `media_type: "video"` and optional `intent: "asl"`. |
| **Orchestrator**| On message with ASL video ref, call Media Service `POST /api/v1/asl/recognize`; put returned transcript into the same turn/message used for LangGraph. |
| **Media Service** | New endpoint `POST /api/v1/asl/recognize`. Validate video; call configured provider (Sign-Speak or open-source); return normalized `{ transcript, confidence? }`. |
| **Sign-Speak**  | (Primary) External API: ASL video in → English transcript out. |
| **Open-source** | (Fallback) WLASL-based or similar model run in Media Service or sidecar: video in → word/gloss sequence → optional LM smoothing → transcript. |

---

## 5. Implementation Paths

### 5.1 Path A: Sign-Speak API (Primary)

**Condition:** Sign-Speak approves the application and provides API access.

**Description:**  
Sign-Speak offers a REST API for ASL recognition (video → English text), with documented recommendations (e.g., conversational pace, well-lit, full upper body, landscape). They also provide a React SDK; for our design we use the **server-side REST API** from the Media Service so that the same contract works for iOS and Web.

**Media Service responsibilities:**

- Accept video (file upload or S3 key).
- If S3 key: ensure Media Service or orchestrator can pass a presigned GET URL or the key; Sign-Speak must accept URL or file (to be confirmed with Sign-Speak).
- Call Sign-Speak with API key (stored in environment/secret manager).
- Map Sign-Speak response to internal schema: `{ transcript: string, confidence?: number }`.
- Handle errors (rate limits, invalid video, timeout) and return structured error to orchestrator.

**Configuration:**

- `ASL_PROVIDER=signspeak`
- `SIGNSPEAK_API_KEY` (or equivalent) from secrets.
- `SIGNSPEAK_BASE_URL` if different from default.

**Pros:** Fast to integrate; no model training or hosting.  
**Cons:** Dependency on third party; cost and rate limits; application must be approved.

---

### 5.2 Path B: Open-Source Model (Fallback)

**Condition:** Sign-Speak does not respond within the agreed timeline or does not approve the application.

**Description:**  
Use a publicly available ASL recognition model (e.g., **WLASL-based**: word-level recognition on ~2,000 ASL words, I3D or Pose-TGCN style). The model runs in our stack; deployment can be in the Media Service container (prototype), a separate inference service, or **AWS SageMaker** (recommended for production).

**Media Service responsibilities:**

- Same public contract: `POST /api/v1/asl/recognize` with video (file or S3 key).
- Internally: load video from S3 or request body → send to configured inference backend (in-process, HTTP endpoint, or SageMaker) → receive word/gloss or transcript.
- Optionally: pass sequence through a small language model or rules to form a single transcript string.
- Return `{ transcript: string, confidence?: number }` (confidence may be from model or fixed for MVP).

**Deployment options (where the model runs):**

| Option | Description | Pros | Cons | When to use |
|--------|-------------|------|------|-------------|
| **Same container as Media Service** | Add PyTorch, OpenCV, WLASL code to the Media Service image; run inference in-process when `POST /api/v1/asl/recognize` is called. | Single service to deploy; simple wiring; no extra network hop. | Large image; scaling tied to Media Service; cold start; GPU must be added to Media Service task if needed. | **Prototype / MVP / class project** only. |
| **Separate inference service (e.g. ECS)** | Dedicated container or service that exposes an HTTP inference endpoint; Media Service calls it (e.g. `ASL_INFERENCE_URL`). | Scale inference independently; isolate heavy ML deps from Media Service. | You manage two services, GPU instance types, and scaling. | When you need full control and are not using SageMaker. |
| **AWS SageMaker** | Deploy the ASL model as a SageMaker real-time (or async) endpoint; Media Service calls the endpoint with video/frames or S3 URI. | Managed infra, auto-scaling, GPU instance types, same AWS account; no model code in Media Service. | SageMaker cost and endpoint management; need to package model for SageMaker. | **Recommended for production** and when staying in AWS. |

For **SageMaker**, Media Service would call the SageMaker endpoint (e.g. via `boto3` InvokeEndpoint or HTTP) with the video S3 URI or preprocessed payload; the endpoint returns the transcript. The rest of the flow (orchestrator → Media Service → response) is unchanged.

**Model and data:**

- WLASL dataset/model: word-level; license (e.g., C-UDA) must be respected; use only for research/educational or compliant use.
- Alternative: Other open-source sign recognition models (e.g., pose-based + classifier) if better suited.

**Pros:** No vendor dependency; full control; no approval process.  
**Cons:** Lower coverage than a commercial API; more engineering (integration, preprocessing, hosting); possible GPU need for latency.

---

### 5.3 Decision and Timeline

| Event | Action |
|-------|--------|
| **T0** | Request submitted to Sign-Speak for API access; application under verification. |
| **T0 + N days** (e.g., N = 14–21) | Decision deadline: if no approval or no response by this date, proceed with **Path B (open-source)**. |
| **If Sign-Speak approved** | Implement Path A; document API key handling and rate limits; no need for self-hosted model. |
| **If not approved / no response** | Implement Path B; select exact WLASL-based (or equivalent) model and hosting strategy. |

The professor and team can set **N** (e.g., 14 or 21 days) based on project milestones.

---

## 6. API Specification

### 6.1 Media Service: `POST /api/v1/asl/recognize`

**Purpose:** Convert ASL video to English text. Used only by the Orchestrator (or internally); not exposed directly to clients.

**Request (option 1 — file upload):**

- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `video`: file (e.g., MP4, WebM); optional `language`: string (default `en-US`).

**Request (option 2 — S3 reference):**

- Method: `POST`
- Content-Type: `application/json`
- Body:
```json
{
  "s3_bucket": "talknshop-media-storage",
  "s3_key": "uploads/<session>/asl-video.mp4"
}
```

**Response (success):**

- Status: `200 OK`
- Body:
```json
{
  "transcript": "find me a laptop under 1000 dollars",
  "confidence": 0.92,
  "provider": "signspeak",
  "processing_time_seconds": 2.1
}
```

**Response (error):**

- Status: `4xx` / `5xx`
- Body (example):
```json
{
  "error": "asl_recognition_failed",
  "message": "Video too short or no sign detected",
  "code": "INVALID_INPUT"
}
```

**Idempotency:** Not required for MVP. Rate limiting and quotas per provider apply (Sign-Speak limits TBD; open-source by our own limits).

---

### 6.2 Orchestrator → Media Service

- Orchestrator already has a **Media Service client** (e.g., `MediaServiceClient`). Add a method such as:
  - `recognize_asl(s3_bucket: str, s3_key: str) -> ASLRecognitionResult`
- `ASLRecognitionResult`: `transcript: str`, optional `confidence: float`.
- On failure: orchestrator can retry once or return a user-facing error (“We couldn’t understand the sign language input. Please try again or type your message.”).

---

### 6.3 Client → Orchestrator (unchanged conceptually)

- Client uploads video to S3 using existing **presigned URL** flow.
- Client sends WebSocket message with:
  - `message`: optional placeholder or empty (e.g., “ASL input” or “”).
  - `media`: `[{ "media_type": "video", "s3_key": "<key>", "content_type": "video/mp4", "size_bytes": 12345 }]`
  - Optional: `input_modality: "asl"` or similar so orchestrator can prioritize ASL recognition.

Orchestrator already supports `media` and `MediaType.VIDEO`; the only addition is the logic “if media contains video and intent is ASL, call Media Service ASL endpoint and use transcript as message.”

---

## 7. Data Flow (End-to-End)

1. **User (iOS or Web):** Chooses “Sign” mode; records short ASL video (e.g., 5–30 seconds).
2. **Client:** Requests presigned URL from Media Service (or orchestrator) for upload; uploads video to S3; gets `s3_key`.
3. **Client:** Sends WebSocket message to orchestrator with `media: [{ media_type: "video", s3_key, ... }]` and optionally `input_modality: "asl"`.
4. **Orchestrator:** Sees video media (+ ASL intent); calls Media Service `POST /api/v1/asl/recognize` with `s3_bucket` and `s3_key`.
5. **Media Service:** Loads video from S3 (or receives file); calls Sign-Speak API **or** open-source model; returns `{ transcript, confidence }`.
6. **Orchestrator:** Sets `message = transcript` (or merges with any typed message) and runs the existing LangGraph flow (ParseInput, NeedMediaOps, BuildRequirementSpec, etc.) as if the user had typed that text.
7. **Rest of flow:** Unchanged (clarification, search, results, streaming response).

No PII is stored in the ASL response beyond what is already in session/state; video can be retained or deleted per existing media retention policy.

---

## 8. Security and Privacy

- **API keys:** Sign-Speak API key stored in environment variables or AWS Secrets Manager; never in client or repo.
- **Video in transit:** HTTPS for all service-to-service and client-to-service calls; S3 presigned URLs over HTTPS.
- **Video at rest:** S3 bucket with existing encryption and access controls; optional short TTL for ASL videos (e.g., delete after 24 hours) to minimize retention.
- **Third-party (Sign-Speak):** Video or URL may be sent to Sign-Speak; privacy policy and DPA must be reviewed if processing personal data; consider anonymization or minimal metadata.
- **Open-source path:** Video stays within our infrastructure; no third-party ASL data sharing.

---

## 9. Client Implementation Outline

### 9.1 iOS App (Expo / React Native)

- **Capture:** Use `expo-camera` (or native AVFoundation) to record a short video (e.g., 5–30 s) in “Sign” mode. Recommend front camera, landscape, well-lit, upper body in frame.
- **Upload:** Use existing presigned URL flow to upload the recorded file to S3; obtain `s3_key`.
- **Send:** Send WebSocket message with `media: [{ media_type: "video", s3_key, content_type, size_bytes }]` and optional `input_modality: "asl"`.
- **UX:** Record button, preview, stop; optional “Processing…” state until orchestrator responds (e.g., first token or clarification).

### 9.2 Web App (React/TypeScript)

- **Capture:** `getUserMedia()` + `MediaRecorder` to record from webcam (same guidelines: well-lit, upper body, landscape preferred). Output format: WebM or MP4 depending on browser; Media Service should accept both or normalize.
- **Upload:** Same presigned URL upload as other media; get `s3_key`.
- **Send:** Same WebSocket payload as iOS.
- **UX:** Same as iOS: record, stop, optional loading state.

---

## 10. Configuration and Feature Flags

- **Orchestrator:**  
  - `ASL_INPUT_ENABLED`: boolean (default `true` in dev; can be toggled per env).  
  - `MEDIA_SERVICE_ASL_ENDPOINT`: optional override for ASL endpoint (default: same base URL as Media Service + `/api/v1/asl/recognize`).

- **Media Service:**  
  - `ASL_PROVIDER`: `signspeak` | `open_source`.  
  - Sign-Speak: `SIGNSPEAK_API_KEY`, `SIGNSPEAK_BASE_URL`.  
  - Open-source (in-container): `ASL_MODEL_PATH`; optional GPU flag.  
  - Open-source (separate service): `ASL_INFERENCE_URL` (HTTP endpoint).  
  - Open-source (SageMaker): `ASL_SAGEMAKER_ENDPOINT_NAME`, `ASL_SAGEMAKER_REGION` (optional; default same as Media Service).

---

## 11. Risks and Mitigation

| Risk | Mitigation |
|------|-------------|
| Sign-Speak does not approve or does not respond | Use Path B (open-source) after deadline N; document decision. |
| Sign-Speak API limits or cost too high | Implement caching for repeated/similar videos if applicable; consider hybrid (Sign-Speak for production, open-source for dev); or move fully to open-source. |
| Open-source model accuracy or coverage low | Set user expectation (“Sign simple phrases”); add fallback message “You can also type your request”; iterate on model or add optional LM smoothing. |
| Video format/codec incompatibility (e.g., Safari vs Chrome) | Media Service normalizes to a single format (e.g., MP4) via FFmpeg or similar; document supported formats. |
| Latency too high (open-source on CPU) | Use GPU for inference (e.g. SageMaker GPU instance or GPU-backed ECS task); or reduce resolution/fps for recognition; or show “Processing…” and accept 5–15 s for MVP. |

| SageMaker endpoint cost or cold start | Use auto-scaling (min instances ≥ 1 if low latency required); consider async inference for batch; monitor endpoint utilization. |

---

## 12. Implementation Phases (Suggested)

| Phase | Scope | Dependency |
|-------|--------|-------------|
| **Phase 1** | Media Service: add `POST /api/v1/asl/recognize` with **stub** (return mock transcript). Orchestrator: call stub when message has ASL video. | None. |
| **Phase 2a** | If Sign-Speak approved: integrate Sign-Speak API behind same endpoint; config `ASL_PROVIDER=signspeak`. | Sign-Speak API key and docs. |
| **Phase 2b** | If not approved: integrate WLASL-based (or chosen) open-source model; config `ASL_PROVIDER=open_source`. Deploy model in Media Service container (prototype) or **AWS SageMaker** (production). | Model choice; hosting: in-container, separate service, or SageMaker endpoint. |
| **Phase 3** | iOS and Web: ASL capture UI, upload, WebSocket message with video ref and ASL intent. | Phase 1 + 2a or 2b. |
| **Phase 4** | Testing, tuning (e.g., max duration, error messages), and documentation. | All above. |

---

## 13. Success Criteria

- User can record ASL video on iOS and Web and receive a response from the assistant based on the recognized text.
- Recognized text is processed by the same buyer/seller flows as typed or voice input.
- If Sign-Speak is used: API key is secure; rate limits and errors are handled gracefully.
- If open-source is used: model runs reliably in our environment; transcript format is consistent with Sign-Speak path for orchestrator compatibility.
- Design is document-ready for professor review and approval.

---

## 14. References

- TalknShop [Architecture](ARCHITECTURE.md)
- [Media Service Design Spec](../apps/media-service/documentation/Media-Service-Design-Spec.md)
- Sign-Speak: [API documentation](https://app.theneo.io/sign-speak/sign-speak-api), [React SDK](https://www.npmjs.com/package/@sign-speak/react-sdk)
- WLASL: [WLASL Homepage](https://dxli94.github.io/WLASL/), [GitHub dxli94/WLASL](https://github.com/dxli94/WLASL)
- AWS SageMaker: [Deploy models to real-time endpoints](https://docs.aws.amazon.com/sagemaker/latest/dg/realtime-endpoints.html)
- Existing orchestrator enums: `MediaType.VIDEO` in `app/models/enums.py`

---

*End of Technical Design Document.*
