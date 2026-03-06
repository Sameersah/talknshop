# TalknShop ASL Integration — Paper Publishing Plan (No User Study)

**Document:** Comprehensive plan for publishing a technical/system paper without a user study  
**Version:** 1.0  
**Date:** February 2025  
**Related:** [ASL Integration Technical Design](ASL_INTEGRATION_TECHNICAL_DESIGN.md), [Architecture](ARCHITECTURE.md)

---

## 1. Goal, Reason, and Purpose of the Paper

### 1.1 Goal (what the paper sets out to do)

- **Primary:** Present the **design and implementation** of ASL input integration into a conversational AI shopping assistant (TalknShop) and demonstrate **technical viability** through latency, reliability, and (optionally) recognition accuracy.
- **Scope:** Document how ASL fits into the existing architecture (orchestrator, Media Service, clients), the provider abstraction (Sign-Speak vs open-source), API contract, and failure handling.
- **Evidence:** Technical evaluation only—no human subject study. Claims are limited to “the pipeline works” and “meets basic performance criteria,” not “users prefer it” or “accessibility is improved in practice.”

### 1.2 Reason (why publish this paper)

- **For authors:** Thesis contribution, citable publication, lower barrier (no IRB, no recruiting Deaf/ASL participants).
- **For the field:** Reusable integration pattern for adding sign-language input to conversational systems; bridges “ASL recognition in isolation” and “conversational AI without accessibility.”
- **Honest positioning:** Fills the integration gap; user experience and accessibility impact are left for future work.

### 1.3 Purpose (what the paper is for)

- **Readers:** Learn how to integrate ASL into a production-like conversational pipeline; get concrete architecture and benchmarks.
- **Community:** Design knowledge and reproducibility; clear scope (technical, not user-study).
- **Authors:** Graduate requirement, portfolio, and foundation for a later user-study paper if desired.

---

## 2. Paper Type and Target Venues

### 2.1 Paper type

- **Technical / system / design paper** with implementation and technical evaluation.
- **Not:** User study, controlled experiment with human participants, or accessibility impact study.

### 2.2 Suggested venues (by priority)

| Venue type | Examples | Typical length | Notes |
|------------|----------|----------------|-------|
| **Accessibility workshops** | ASSETS workshop, W4A short papers | 4–6 pages | Good fit for “accessible system” angle. |
| **NLP / conversational AI workshops** | SIGdial, Applied NLP workshops | 4–8 pages | Emphasize integration with dialogue/LangGraph. |
| **System / experience tracks** | CHI extended abstracts, EAI GoodTech | 4–6 pages | “We built it; here’s how and how it performs.” |
| **Thesis chapter** | N/A | As required | Same content, expanded; no separate venue. |

### 2.3 Venue selection checklist

- [ ] Confirm page limit and format (ACM, IEEE, etc.).
- [ ] Check submission and notification dates vs thesis timeline.
- [ ] Verify that technical/system papers without user studies are in scope (read prior years’ titles).

---

## 3. Paper Structure (Sections)

### 3.1 Suggested outline

1. **Abstract** (150–250 words)  
   - Problem: accessibility of conversational shopping for Deaf/hard-of-hearing users.  
   - Contribution: design and implementation of ASL input integration in TalknShop; technical evaluation (latency, reliability).  
   - Scope: no user study; future work may include one.

2. **Introduction** (≈1 page)  
   - Motivation: why ASL input in a shopping assistant matters.  
   - Gap: prior work on ASL recognition vs conversational systems; integration is underreported.  
   - Contribution: (a) architecture and API design, (b) implementation (at least one path), (c) technical evaluation.  
   - Limitation: “We do not report a user study; that is left for future work.”

3. **Related Work** (≈0.5–1 page)  
   - ASL recognition (e.g., WLASL, Sign-Speak, other APIs/models).  
   - Conversational AI for e-commerce and assistants.  
   - Accessibility in conversational systems (brief).

4. **System Context** (≈0.5 page)  
   - TalknShop overview: orchestrator, Media Service, clients, existing input modalities (text, audio, image).  
   - Reference to Architecture doc; high-level diagram.

5. **ASL Integration Design** (≈1–1.5 pages)  
   - End-to-end flow: client capture → upload → orchestrator → Media Service → ASL provider → transcript → same conversation flow.  
   - Provider abstraction: Sign-Speak (primary) vs open-source (fallback); same API contract.  
   - API: `POST /api/v1/asl/recognize` (input: video or S3 ref; output: transcript, confidence).  
   - Failure handling and user-facing messaging.  
   - Reuse figures from [ASL_INTEGRATION_TECHNICAL_DESIGN.md](ASL_INTEGRATION_TECHNICAL_DESIGN.md).

6. **Implementation** (≈0.5–1 page)  
   - What was built: Media Service endpoint, orchestrator integration, client changes (e.g., web and/or iOS).  
   - Which path(s): Sign-Speak and/or open-source; deployment (e.g., same container vs SageMaker).  
   - Challenges and design decisions (e.g., timeouts, retries, provider switch).

7. **Evaluation** (≈1 page)  
   - **Latency:** End-to-end (e.g., video ready → transcript received). Mean, median, p95; N and test setup (e.g., 50–200 requests, 5–15 s videos). Optional: breakdown (upload, recognition).  
   - **Reliability:** Success rate; failure modes (timeout, invalid video, API error).  
   - **Recognition quality (optional):** If using own model: WER on a benchmark or internal test set; if API only: internal test set only, with clear limitations.  
   - Environment: e.g., staging, AWS region.

8. **Discussion** (≈0.5 page)  
   - Interpretation: latency acceptable for conversational use? Reliability sufficient for MVP?  
   - Limitations: no user study; single provider or limited test set.  
   - Future work: user study with Deaf/ASL users; more providers; text-to-ASL output.

9. **Conclusion** (short)  
   - Summary of design, implementation, and technical results; reiterate scope (no user study).

10. **References**  
    - ASL datasets/models, Sign-Speak (if used), conversational AI, accessibility.

### 3.2 Page budget (example for 6-page workshop paper)

| Section        | Pages |
|----------------|-------|
| Abstract       | 0.25  |
| Introduction   | 1     |
| Related Work   | 0.75  |
| System Context | 0.5   |
| ASL Design     | 1.25  |
| Implementation | 0.75  |
| Evaluation     | 1     |
| Discussion     | 0.5   |
| Conclusion     | 0.25  |
| References     | 0.5–0.75 |

---

## 4. Evaluation Plan (Technical Only)

### 4.1 Latency

- **Metric:** End-to-end latency from “video available for processing” to “transcript received by orchestrator.”
- **Measure:** Timestamps in code at (1) video ready, (2) request to Media Service, (3) response with transcript. Report mean, median, p95 (and optionally min/max).
- **Test set:** Fixed set of test videos (e.g., 10–30 clips), consistent duration (e.g., 5–15 s). Run 50–200 requests (or as many as feasible).
- **Environment:** Document (e.g., “staging, AWS us-west-2” or “local Docker”).
- **Optional:** Breakdown by upload time vs recognition time.

### 4.2 Reliability

- **Metrics:** Success rate (% of requests returning a valid transcript); count of failure types (timeout, invalid video, API error, empty transcript).
- **Same test set and N as latency.** If fallback path exists: report success rate for primary only and for primary + fallback.
- **Report:** Short table (failure type vs count) and one or two sentences on user-facing behavior on failure.

### 4.3 Recognition accuracy (optional)

- **If using own model (e.g., WLASL-based):** Run on a public test set if license permits; report WER or gloss accuracy. Cite dataset and protocol.
- **If using Sign-Speak or internal only:** Create a small internal test set (e.g., 20–50 phrases with reference transcripts); report WER or exact-match %. State clearly: “Internal set; not representative of all users.”
- **If omitted:** State in paper that recognition quality was not evaluated and is left for future work.

### 4.4 Evaluation checklist

- [ ] Define test video set and reference transcripts (if accuracy is reported).
- [ ] Implement logging/timestamps for latency and success/failure.
- [ ] Run at least 50 requests (more if possible) in a stable environment.
- [ ] Aggregate results and create tables/figures for the paper.
- [ ] Document environment and limitations in the paper.

---

## 5. Implementation Checklist (Before Writing)

Complete enough of the following so the paper describes real choices and reports real numbers:

- [ ] **Media Service:** `POST /api/v1/asl/recognize` implemented; accepts video (file or S3 ref); returns `{ transcript, confidence? }`.
- [ ] **At least one provider:** Sign-Speak integrated **or** open-source model (e.g., WLASL-based) deployed and callable from Media Service.
- [ ] **Orchestrator:** Detects ASL video in incoming message; calls Media Service ASL endpoint; injects transcript into same turn/conversation flow.
- [ ] **Client (at least one):** Web or iOS can record short ASL video, upload (e.g., via presigned URL), and send message with video ref and intent (e.g., `input_modality: "asl"`).
- [ ] **End-to-end:** One path works from “user uploads ASL video” to “orchestrator has transcript and continues conversation.”
- [ ] **Evaluation harness:** Script or manual process to run test videos through the pipeline and collect latency + success/failure; optional: accuracy on internal set or benchmark.

---

## 6. Timeline and Milestones

| Phase | Activities | Target |
|-------|------------|--------|
| **1. Implementation** | Media Service ASL endpoint; one provider; orchestrator + client integration; E2E working | 4–6 weeks |
| **2. Evaluation** | Define test set; run latency/reliability (and optional accuracy); summarize in tables/figures | 1–2 weeks |
| **3. Draft** | Outline → full draft following Section 3; reuse figures from ASL design doc | 2–3 weeks |
| **4. Internal review** | Advisor/peer feedback; revise | 1 week |
| **5. Venue** | Pick venue; format to template; submit | By venue deadline |
| **6. Revisions** | Address reviews (if accepted); camera-ready | Per venue schedule |

Adjust dates to match thesis and venue deadlines.

---

## 7. Deliverables

- [ ] **Paper draft** (PDF): All sections in Section 3, within page limit.
- [ ] **Figures:** System/sequence diagram (from design doc); optional: latency distribution, success/failure pie chart.
- [ ] **Tables:** Latency (mean, median, p95); failure breakdown; optional: accuracy (WER/internal set).
- [ ] **Supplementary (optional):** Link to code or API spec; one-page appendix with extra results if allowed.
- [ ] **.md version of plan:** This document (for version control and sharing).
- [ ] **Google Doc version:** Copy of this plan for collaboration (see Section 8).

---

## 8. Using This Plan in Google Docs

This plan is maintained as a Markdown file at `documentation/PAPER_PUBLISHING_PLAN.md`. To use it in Google Docs:

1. Open [Google Docs](https://docs.google.com) and create a new document (e.g., “TalknShop Paper Publishing Plan”).
2. Open `documentation/PAPER_PUBLISHING_PLAN.md` in your editor or on GitHub (if pushed).
3. Copy the full content and paste into the Google Doc.
4. Apply heading styles (Heading 1, 2, 3) where appropriate for the outline.
5. Use the Doc for shared editing and comments; keep the .md file as the single source of truth and sync major updates back to the repo if desired.

---

## 9. References to Cite (Starter List)

- **ASL recognition:** WLASL dataset/model; Sign-Speak (if used); other sign-language recognition surveys.
- **Conversational AI:** LangGraph, dialogue systems, task-oriented assistants.
- **Accessibility:** ASSETS/W4A papers on accessible systems; Deaf users and technology.
- **TalknShop:** Your own architecture and ASL technical design docs (as internal references; cite in “System Context” or footnote).

---

## 10. Summary

| Item | Description |
|------|-------------|
| **Goal** | Design + implementation + technical evaluation of ASL integration in TalknShop. |
| **Evidence** | Latency, reliability, optional recognition accuracy; no user study. |
| **Venues** | Accessibility/NLP/CHI workshops or system tracks; or thesis chapter. |
| **Sections** | Abstract, Intro, Related Work, System Context, ASL Design, Implementation, Evaluation, Discussion, Conclusion, Refs. |
| **Evaluation** | End-to-end latency (mean/median/p95), success rate and failure breakdown, optional WER/internal set. |
| **Before writing** | One E2E path working; evaluation harness run; results summarized. |

This plan is the single reference for publishing the non–user-study paper. Update this document as you lock venues, complete evaluation, and finalize the draft.
