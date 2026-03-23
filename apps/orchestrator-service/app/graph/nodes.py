"""
LangGraph Node Implementations

Implements all 10 nodes for the buyer flow state machine:
1. ParseInput (Tool) - Parse and normalize user input
2. NeedMediaOps (Agent/LLM) - Decide if media processing needed
3. TranscribeAudio (Tool) - Transcribe audio via media-service
4. ExtractImageAttrs (Tool) - Extract image attributes via media-service
5. BuildOrUpdateRequirementSpec (Agent/LLM) - Build structured requirements
6. NeedClarify (Agent/LLM) - Decide if clarification needed
7. AskClarifyingQ (Agent/LLM) - Generate clarifying question
8. SearchMarketplaces (Tool) - Search products via catalog-service
9. RankAndCompose (Tool) - Rank results and compose response
10. Done (Terminal) - Final node, return response
"""

import json
import logging
import re
from datetime import datetime
from typing import Any

from langchain_aws import ChatBedrock
from langchain_core.messages import HumanMessage

from app.core.config import settings
from app.core.aws_clients import get_bedrock_client
from app.db.dynamodb import session_repo
from app.services.media_client import MediaServiceClient
from app.services.catalog_client import CatalogServiceClient
from app.models.schemas import RequirementSpec, TurnInput, ProductResult
from app.models.enums import WorkflowStage
from app.graph.state import WorkflowState
from app.graph.prompts import (
    NEED_MEDIA_OPS_PROMPT,
    BUILD_REQUIREMENT_SPEC_PROMPT,
    NEED_CLARIFY_PROMPT,
    ASK_CLARIFYING_Q_PROMPT,
    format_media_info,
    format_transcript_section,
    format_image_attrs_section,
    format_requirement_spec,
)

logger = logging.getLogger(__name__)

# UX research: 3–6 results reduce cognitive load vs 10; 6 balances choice without overwhelming
# (e.g. Baymard, UX studies on result set size and perceived difficulty)
TOP_N_RESULTS = 6


def _media_type(ref: Any) -> str:
    """Return media type string from a MediaReference or dict (e.g. 'image', 'audio', 'video')."""
    if isinstance(ref, dict):
        return (ref.get("media_type") or "").lower()
    mt = getattr(ref, "media_type", None)
    if hasattr(mt, "value"):
        return (mt.value or "").lower()
    return (mt or "").lower()


def _s3_key(ref: Any) -> str:
    """Return s3_key from a MediaReference or dict."""
    if isinstance(ref, dict):
        return ref.get("s3_key") or ""
    return getattr(ref, "s3_key", "") or ""


# Inference profile IDs (e.g. global.anthropic.claude-sonnet-4-6) use a region/scope prefix;
# langchain_aws infers provider from the first segment, so we must pass provider explicitly.
_INFERENCE_PROFILE_PREFIXES = ("global.", "us.", "eu.", "us-gov.", "apac.", "sa.", "amer.", "jp.", "au.")


def _extract_json_from_llm_response(content: str) -> dict:
    """Parse JSON from LLM response; strip markdown code fences and handle empty. Raises on failure."""
    raw = (content or "").strip()
    if not raw:
        raise ValueError("LLM returned empty content")
    # Strip ```json ... ``` or ``` ... ```
    match = re.search(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", raw, re.DOTALL | re.IGNORECASE)
    if match:
        raw = match.group(1).strip()
    if not raw:
        raise ValueError("LLM returned no JSON inside code block")
    return json.loads(raw)


def _bedrock_chat_kwargs(extra_model_kwargs: dict | None = None) -> dict:
    """Base kwargs for ChatBedrock. Sets provider='anthropic' when using an inference profile ID."""
    model_id = settings.bedrock_model_id
    kwargs: dict = {
        "client": get_bedrock_client(),
        "model_id": model_id,
    }
    if model_id.startswith(_INFERENCE_PROFILE_PREFIXES):
        kwargs["provider"] = "anthropic"
    if extra_model_kwargs:
        kwargs["model_kwargs"] = extra_model_kwargs
    return kwargs


# Product types (or keywords in product_type) that are "wearable" — we ask for color if missing
_WEARABLE_KEYWORDS = frozenset({
    "shirt", "blouse", "tee", "t-shirt", "hoodie", "sweater", "sweatshirt", "jacket", "coat",
    "pants", "jeans", "shorts", "dress", "skirt", "shoes", "sneakers", "boot", "sandals",
    "hat", "cap", "bag", "backpack", "watch", "jewelry", "glasses", "sunglasses",
    "apparel", "clothing", "wear", "footwear", "accessory", "accessories", "wearable",
})


def _is_wearable(product_type: str) -> bool:
    """True if product_type describes something wearable (clothing, shoes, accessories)."""
    if not product_type:
        return False
    pt = product_type.strip().lower()
    return any(kw in pt for kw in _WEARABLE_KEYWORDS)


def _has_color_in_spec(spec: RequirementSpec) -> bool:
    """True if requirement spec has a color (or colour) in attributes or filters."""
    if not spec:
        return False
    attrs = (getattr(spec, "attributes", None) or {}) if hasattr(spec, "attributes") else {}
    filters = (getattr(spec, "filters", None) or {}) if hasattr(spec, "filters") else {}
    if not isinstance(attrs, dict):
        attrs = {}
    if not isinstance(filters, dict):
        filters = {}
    for d in (attrs, filters):
        for key in ("color", "colour", "Color", "Colour"):
            if key in d and d[key]:
                return True
        for k, v in d.items():
            if "color" in k.lower() and v:
                return True
    return False


def _fallback_requirement_spec_from_message(user_message: str) -> RequirementSpec:
    """Build a minimal RequirementSpec from user message when LLM fails. E.g. 'I want to buy nike shoes' -> shoes + nike."""
    import re
    from app.models.enums import MarketplaceProvider
    msg = (user_message or "").strip().lower()
    if not msg:
        return RequirementSpec(
            product_type="product",
            attributes={},
            filters={},
            brand_preferences=[],
            marketplaces=[MarketplaceProvider.AMAZON],
        )
    # Remove common stopwords; keep meaningful words
    stop = {"i", "want", "to", "buy", "a", "an", "the", "some", "get", "find", "looking", "for", "need", "me"}
    words = [w for w in re.split(r"\W+", msg) if w and w not in stop]
    # Common brands we can detect (partial match)
    known_brands = {"nike", "adidas", "apple", "samsung", "sony", "dell", "hp", "lenovo", "amazon", "armour"}
    brands = [w for w in words if w in known_brands]
    # Prefer: if we have a known brand, use it as brand and rest as product_type
    if brands:
        product_words = [w for w in words if w not in brands]
        product_type = " ".join(product_words).strip() or "product"
        brand_preferences = [b.capitalize() for b in brands[:3]]  # max 3 brands
    else:
        product_type = " ".join(words).strip() or "product"
        brand_preferences = []
    return RequirementSpec(
        product_type=product_type[:200],
        attributes={},
        filters={},
        brand_preferences=brand_preferences,
        marketplaces=[MarketplaceProvider.AMAZON],
    )


# Initialize service clients
media_client = MediaServiceClient(base_url=settings.media_service_url)
catalog_client = CatalogServiceClient(base_url=settings.catalog_service_url)


async def parse_input(state: WorkflowState) -> WorkflowState:
    """
    Node 1: ParseInput (Tool/Service)
    
    Loads session from DynamoDB, normalizes user message,
    and extracts media metadata.
    """
    logger.info(f"ParseInput: Processing session {state['session_id']}")
    
    try:
        # Load or create session
        session = await session_repo.get_session(state["session_id"])
        if not session:
            session = await session_repo.create_session(
                session_id=state["session_id"],
                user_id=state["user_id"]
            )
        
        # Normalize user message
        user_message = state.get("user_message", "").strip()
        media_refs = state.get("media_refs", [])

        # ASL retry: when the ASL service returns "I didn't catch that sign clearly...",
        # don't run it through requirement building; we'll reply with a short "try again" message.
        asl_retry_requested = "didn't catch that sign clearly" in (user_message or "")

        turn_input = TurnInput(
            message=user_message,
            session_id=state["session_id"],
            user_id=state["user_id"],
            media=media_refs,
        )
        
        # Update state
        state.update({
            "stage": WorkflowStage.INITIAL,
            "turn_input": turn_input,
            "user_message": user_message,
            "media_refs": media_refs,
            "asl_retry_requested": asl_retry_requested,
            "clarification_count": state.get("clarification_count", 0),
            "node_trace": state.get("node_trace", []) + ["parse_input"],
            "updated_at": datetime.utcnow(),
        })
        
        logger.info(
            "ParseInput: user_message=%r media_refs=%d types=%s",
            (user_message[:80] + "..." if len(user_message) > 80 else user_message),
            len(media_refs),
            [_media_type(r) for r in media_refs],
        )
        return state
        
    except Exception as e:
        logger.error(f"ParseInput error: {e}", exc_info=True)
        state["error"] = str(e)
        state["stage"] = WorkflowStage.FAILED
        return state


async def need_media_ops(state: WorkflowState) -> WorkflowState:
    """
    Node 2: NeedMediaOps (Agent/LLM)
    
    Uses Bedrock (Claude 3 Sonnet) to decide if audio transcription
    or image processing is needed.
    """
    logger.info(f"NeedMediaOps: Analyzing media requirements")
    
    try:
        media_refs = state.get("media_refs", [])
        user_message = state.get("user_message", "")
        
        # Local mock path: skip Bedrock/media ops entirely
        if settings.use_mock_services:
            state.update({
                "need_stt": False,
                "need_vision": False,
                "stage": WorkflowStage.REQUIREMENT_BUILDING,
                "node_trace": state.get("node_trace", []) + ["need_media_ops"],
            })
            return state
        
        # Quick check: no media = no ops needed
        if not media_refs:
            logger.info("NeedMediaOps: no media_refs, skipping media processing")
            state.update({
                "need_stt": False,
                "need_vision": False,
                "stage": WorkflowStage.REQUIREMENT_BUILDING,
                "node_trace": state.get("node_trace", []) + ["need_media_ops"],
            })
            return state
        
        # Determine which media types are present (used for routing and to gate LLM decision)
        has_audio = any(_media_type(ref) == "audio" for ref in media_refs)
        has_image = any(_media_type(ref) == "image" for ref in media_refs)
        logger.info(
            "NeedMediaOps: media_refs=%d, has_audio=%s, has_image=%s, types=%s",
            len(media_refs),
            has_audio,
            has_image,
            [_media_type(ref) for ref in media_refs],
        )
        
        # Build prompt with media context
        media_info = format_media_info([
            ref.dict() if hasattr(ref, "dict") else ref for ref in media_refs
        ])
        
        prompt = NEED_MEDIA_OPS_PROMPT.format(
            message=user_message,
            media_info=media_info,
        )
        
        # Call Bedrock
        llm = ChatBedrock(**_bedrock_chat_kwargs({"temperature": 0.1, "max_tokens": 500}))
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = (getattr(response, "content", None) or "")
        if isinstance(content, list):
            content = " ".join(str(c) for c in content)
        content = str(content).strip()
        try:
            result = _extract_json_from_llm_response(content)
        except Exception:
            result = {}
        need_stt = result.get("need_stt", False) and has_audio
        need_vision = result.get("need_vision", False) and has_image
        logger.info(
            "NeedMediaOps: LLM result need_stt=%s need_vision=%s (raw: %s); after gating: need_stt=%s need_vision=%s",
            result.get("need_stt"), result.get("need_vision"), result,
            need_stt, need_vision,
        )
        state.update({
            "need_stt": need_stt,
            "need_vision": need_vision,
            "stage": WorkflowStage.MEDIA_PROCESSING,
            "node_trace": state.get("node_trace", []) + ["need_media_ops"],
            "llm_calls": state.get("llm_calls", []) + [{
                "node": "need_media_ops",
                "prompt": prompt[:200],
                "response": content[:500] if content else "",
                "timestamp": datetime.utcnow().isoformat()
            }]
        })
        
        logger.info(f"NeedMediaOps: need_stt={state['need_stt']}, need_vision={state['need_vision']}")
        return state
        
    except Exception as e:
        logger.error(f"NeedMediaOps error: {e}", exc_info=True)
        # Fallback: skip media ops on error
        state.update({
            "need_stt": False,
            "need_vision": False,
            "stage": WorkflowStage.REQUIREMENT_BUILDING,
        })
        return state


async def transcribe_audio(state: WorkflowState) -> WorkflowState:
    """
    Node 3: TranscribeAudio (Tool/Service - Conditional)
    
    Calls media-service to transcribe audio and returns transcript.
    Only runs if need_stt == True.
    """
    logger.info(f"TranscribeAudio: Transcribing audio")
    
    try:
        media_refs = state.get("media_refs", [])
        audio_refs = [ref for ref in media_refs if _media_type(ref) == "audio"]
        
        if not audio_refs:
            logger.warning("TranscribeAudio: No audio refs found")
            return state
        
        # Transcribe first audio file (can extend to multiple)
        audio_ref = audio_refs[0]
        transcript = await media_client.transcribe_audio(_s3_key(audio_ref))
        
        state.update({
            "audio_transcript": getattr(transcript, "transcript", "") or "",
            "node_trace": state.get("node_trace", []) + ["transcribe_audio"],
        })
        
        logger.info(f"TranscribeAudio: Transcript length: {len(state['audio_transcript'])} chars")
        return state
        
    except Exception as e:
        logger.error(f"TranscribeAudio error: {e}", exc_info=True)
        state["audio_transcript"] = None
        return state


async def extract_image_attrs(state: WorkflowState) -> WorkflowState:
    """
    Node 4: ExtractImageAttrs (Tool/Service - Conditional)
    
    Calls media-service to extract attributes from images.
    Only runs if need_vision == True.
    """
    media_refs = state.get("media_refs", [])
    image_refs = [ref for ref in media_refs if _media_type(ref) == "image"]
    logger.info(
        "ExtractImageAttrs: starting media_refs=%d image_refs=%d",
        len(media_refs), len(image_refs),
    )
    
    try:
        if not image_refs:
            logger.warning("ExtractImageAttrs: No image refs found, skipping")
            return state
        
        # Process first image (can extend to multiple)
        image_ref = image_refs[0]
        s3_key = _s3_key(image_ref)
        logger.info("ExtractImageAttrs: calling media_client.extract_image_attributes s3_key=%s", s3_key)
        attributes = await media_client.extract_image_attributes(s3_key)
        
        state.update({
            "image_attributes": attributes,
            "node_trace": state.get("node_trace", []) + ["extract_image_attrs"],
        })
        
        labels = getattr(attributes, "labels", []) or []
        text = getattr(attributes, "text", []) or []
        logger.info(
            "ExtractImageAttrs: done labels_count=%d text_count=%d labels=%s",
            len(labels), len(text), labels[:15],
        )
        return state
        
    except Exception as e:
        logger.error("ExtractImageAttrs error: %s", e, exc_info=True)
        state["image_attributes"] = None
        return state


async def build_or_update_requirement_spec(state: WorkflowState) -> WorkflowState:
    """
    Node 5: BuildOrUpdateRequirementSpec (Agent/LLM)
    
    Critical node: Uses Bedrock to extract structured RequirementSpec
    from natural language (text + media results).
    """
    user_message = state.get("user_message", "")
    audio_transcript = state.get("audio_transcript", "")
    image_attributes_raw = state.get("image_attributes")
    # Normalize to dict for format_image_attrs_section (may be Pydantic model)
    image_attributes = (
        image_attributes_raw.model_dump() if hasattr(image_attributes_raw, "model_dump") else (image_attributes_raw or {})
    )
    logger.info(
        "BuildRequirement: building spec user_message=%r has_transcript=%s has_image_attrs=%s image_labels=%s",
        (user_message[:60] + "..." if len(user_message) > 60 else user_message),
        bool(audio_transcript),
        bool(image_attributes),
        (image_attributes.get("labels", [])[:10] if isinstance(image_attributes, dict) else []),
    )
    
    try:
        existing_spec = state.get("requirement_spec")
        # On resume after clarification, state may lack requirement_spec; load from session so we merge
        if not existing_spec:
            session = await session_repo.get_session(state["session_id"])
            if session and session.requirement_spec:
                existing_spec = session.requirement_spec
                state["requirement_spec"] = existing_spec
        
        if settings.use_mock_services:
            # Local mock: build a simple spec without Bedrock
            inferred_type = (user_message or "product").split(" ")[0][:40] or "product"
            requirement_spec = RequirementSpec(
                product_type=inferred_type,
                attributes={"mock": True},
                filters={"price": {"max": 1000}},
                brand_preferences=[]
            )
            prompt = content = ""
        else:
            # Build structured prompt sections
            transcript_section = format_transcript_section(audio_transcript)
            image_attrs_section = format_image_attrs_section(image_attributes or {})
            current_spec = format_requirement_spec(existing_spec.model_dump() if existing_spec else {})
            
            prompt = BUILD_REQUIREMENT_SPEC_PROMPT.format(
                message=user_message,
                transcript_section=transcript_section,
                image_attrs_section=image_attrs_section,
                current_spec=current_spec,
            )
            
            # Call Bedrock
            llm = ChatBedrock(**_bedrock_chat_kwargs({"temperature": 0.2, "max_tokens": 1000}))
            
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            content = getattr(response, "content", None) or ""
            if isinstance(content, list):
                content = " ".join(str(c) for c in content)
            content = str(content).strip()
            if not content:
                logger.warning("BuildRequirement: LLM returned empty content; using fallback spec")
                requirement_spec = _fallback_requirement_spec_from_message(user_message)
            else:
                try:
                    spec_data = _extract_json_from_llm_response(content)
                    requirement_spec = RequirementSpec(**spec_data)
                except (ValueError, json.JSONDecodeError) as parse_err:
                    logger.warning("BuildRequirement: LLM response not valid JSON (%s); using fallback", parse_err)
                    requirement_spec = _fallback_requirement_spec_from_message(user_message)
        
        # Save to DynamoDB
        await session_repo.save_requirement_spec(
            state["session_id"],
            requirement_spec
        )
        
        state.update({
            "requirement_spec": requirement_spec,
            "requirement_history": state.get("requirement_history", []) + [requirement_spec],
            "stage": WorkflowStage.REQUIREMENT_BUILDING,
            "node_trace": state.get("node_trace", []) + ["build_requirement"],
            "llm_calls": state.get("llm_calls", []) + [{
                "node": "build_requirement",
                "prompt": prompt[:200],
                "response": content[:500] if content else "",
                "timestamp": datetime.utcnow().isoformat()
            }]
        })
        
        logger.info(f"BuildRequirement: Created spec for {requirement_spec.product_type}")
        return state
        
    except Exception as e:
        logger.error(f"BuildRequirement error: {e}", exc_info=True)
        # Fallback: build minimal spec from user message so we can still try catalog search
        user_message = state.get("user_message", "")
        requirement_spec = _fallback_requirement_spec_from_message(user_message)
        try:
            await session_repo.save_requirement_spec(state["session_id"], requirement_spec)
        except Exception:
            pass
        state.update({
            "requirement_spec": requirement_spec,
            "requirement_history": state.get("requirement_history", []) + [requirement_spec],
            "stage": WorkflowStage.REQUIREMENT_BUILDING,
            "node_trace": state.get("node_trace", []) + ["build_requirement"],
        })
        state.pop("error", None)
        logger.info(f"BuildRequirement: Using fallback spec for {requirement_spec.product_type}")
        return state


async def need_clarify(state: WorkflowState) -> WorkflowState:
    """
    Node 6: NeedClarify (Agent/LLM)
    
    Uses Bedrock to decide if the requirement spec is sufficient
    to search, or if clarification is needed.
    """
    logger.info(f"NeedClarify: Assessing requirement completeness")
    
    try:
        requirement_spec = state.get("requirement_spec")
        clarification_count = state.get("clarification_count", 0)
        
        # Local mock path: assume spec is sufficient
        if settings.use_mock_services:
            state.update({
                "needs_clarification": False,
                "clarification_reason": "",
                "stage": WorkflowStage.SEARCHING,
                "node_trace": state.get("node_trace", []) + ["need_clarify"],
            })
            return state
        
        # Guardrail: limit clarification loops
        if clarification_count >= 2:
            logger.info("NeedClarify: Max clarifications reached, proceeding to search")
            state.update({
                "needs_clarification": False,
                "stage": WorkflowStage.SEARCHING,
                "node_trace": state.get("node_trace", []) + ["need_clarify"],
            })
            return state
        
        if not requirement_spec:
            # No spec = definitely need clarification
            state.update({
                "needs_clarification": True,
                "clarification_reason": "No requirement spec built",
                "stage": WorkflowStage.CLARIFICATION,
                "node_trace": state.get("node_trace", []) + ["need_clarify"],
            })
            return state

        # Deterministic guardrail: require product_type + at least one meaningful constraint
        # This prevents the LLM from proceeding too early for vague queries like "best headphones".
        def _has_meaningful_constraint(spec: RequirementSpec) -> bool:
            try:
                attrs = (spec.attributes or {}) if hasattr(spec, "attributes") else {}
                price = getattr(spec, "price", None)
                brand_prefs = getattr(spec, "brand_preferences", None) or []
                rating_min = getattr(spec, "rating_min", None)
                condition = getattr(spec, "condition", None)

                price_ok = bool(price and (getattr(price, "max", None) is not None or getattr(price, "min", None) is not None))
                brand_ok = len(brand_prefs) > 0
                rating_ok = rating_min is not None
                condition_ok = condition is not None
                attrs_ok = isinstance(attrs, dict) and len(attrs.keys()) > 0
                return bool(price_ok or brand_ok or rating_ok or condition_ok or attrs_ok)
            except Exception:
                return False

        product_type = getattr(requirement_spec, "product_type", None)
        has_product_type = bool(product_type and str(product_type).strip())
        has_constraint = _has_meaningful_constraint(requirement_spec)

        logger.info(
            "NeedClarify: product_type=%r has_product_type=%s has_constraint=%s",
            product_type, has_product_type, has_constraint,
        )
        if not has_product_type or not has_constraint:
            missing = []
            if not has_product_type:
                missing.append("product type")
            if not has_constraint:
                missing.append("at least one constraint (budget, brand, or key feature)")
            reason = "Missing " + " and ".join(missing)
            logger.info("NeedClarify: requesting clarification reason=%s", reason)
            state.update({
                "needs_clarification": True,
                "clarification_reason": reason,
                "stage": WorkflowStage.CLARIFICATION,
                "node_trace": state.get("node_trace", []) + ["need_clarify"],
            })
            return state

        # Wearable guardrail: for clothing/shoes/accessories, require color in req context
        if _is_wearable(str(product_type or "")) and not _has_color_in_spec(requirement_spec):
            reason = "Color preference missing (helpful for clothing/apparel)"
            logger.info("NeedClarify: wearable product without color, requesting clarification reason=%s", reason)
            state.update({
                "needs_clarification": True,
                "clarification_reason": reason,
                "stage": WorkflowStage.CLARIFICATION,
                "node_trace": state.get("node_trace", []) + ["need_clarify"],
            })
            return state
        
        # Build prompt
        prompt = NEED_CLARIFY_PROMPT.format(
            requirement_spec=requirement_spec.model_dump_json(indent=2),
            clarification_count=clarification_count,
        )
        
        # Call Bedrock
        llm = ChatBedrock(**_bedrock_chat_kwargs({"temperature": 0.1, "max_tokens": 300}))
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = (getattr(response, "content", None) or "")
        if isinstance(content, list):
            content = " ".join(str(c) for c in content)
        content = str(content).strip()
        try:
            result = _extract_json_from_llm_response(content)
        except Exception:
            result = {}
        state.update({
            "needs_clarification": result.get("needs_clarification", False),
            "clarification_reason": result.get("reason", ""),
            "stage": WorkflowStage.CLARIFICATION if result.get("needs_clarification") else WorkflowStage.SEARCHING,
            "node_trace": state.get("node_trace", []) + ["need_clarify"],
            "llm_calls": state.get("llm_calls", []) + [{
                "node": "need_clarify",
                "prompt": prompt[:200],
                "response": content[:500] if content else "",
                "timestamp": datetime.utcnow().isoformat()
            }]
        })
        
        logger.info(
            "NeedClarify: needs_clarification=%s reason=%s",
            state["needs_clarification"], state.get("clarification_reason", ""),
        )
        return state
        
    except Exception as e:
        logger.error(f"NeedClarify error: {e}", exc_info=True)
        # Fallback: proceed to search on error
        state.update({
            "needs_clarification": False,
            "stage": WorkflowStage.SEARCHING,
        })
        return state


async def ask_clarifying_question(state: WorkflowState) -> WorkflowState:
    """
    Node 7: AskClarifyingQ (Agent/LLM - Conditional Loop)
    
    Generates a clarifying question and PAUSES the workflow.
    The workflow resumes when user provides an answer.
    """
    clarification_reason = state.get("clarification_reason", "")
    logger.info(
        "AskClarifyingQ: generating question clarification_reason=%s",
        clarification_reason,
    )
    
    try:
        requirement_spec = state.get("requirement_spec")
        
        # Local mock path: craft a static question
        if settings.use_mock_services:
            clarifying_question = "Could you share your preferred budget or brands?"
            state.update({
                "clarifying_question": clarifying_question,
                "clarification_count": state.get("clarification_count", 0) + 1,
                "stage": WorkflowStage.CLARIFICATION,
                "node_trace": state.get("node_trace", []) + ["ask_clarifying_q"],
            })
            return state
        
        # Build prompt
        prompt = ASK_CLARIFYING_Q_PROMPT.format(
            message=state.get("user_message", ""),
            requirement_spec=requirement_spec.model_dump_json(indent=2) if requirement_spec else "{}",
            clarification_reason=clarification_reason,
            clarification_count=state.get("clarification_count", 0),
        )
        
        # Call Bedrock
        llm = ChatBedrock(**_bedrock_chat_kwargs({"temperature": 0.3, "max_tokens": 200}))
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = getattr(response, "content", None) or ""
        if isinstance(raw, list):
            raw = " ".join(str(c) for c in raw)
        raw = str(raw).strip()
        clarifying_question = raw
        suggestions = []
        context = None
        try:
            parsed = _extract_json_from_llm_response(raw)
            if isinstance(parsed, dict):
                clarifying_question = str(parsed.get("question") or raw).strip()
                suggestions = parsed.get("suggestions") or []
                context = parsed.get("context")
        except Exception:
            # If model didn't return JSON, fall back to raw text (strip markdown for display)
            if raw.startswith("```"):
                match = re.search(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", raw, re.DOTALL | re.IGNORECASE)
                if match:
                    try:
                        parsed = json.loads(match.group(1).strip())
                        if isinstance(parsed, dict) and parsed.get("question"):
                            clarifying_question = str(parsed["question"])
                            suggestions = parsed.get("suggestions") or []
                            context = parsed.get("context")
                    except Exception:
                        pass
        
        logger.info("AskClarifyingQ: question=%s", clarifying_question[:100] if clarifying_question else "")
        state.update({
            "clarifying_question": clarifying_question,
            "clarifying_suggestions": suggestions,
            "clarifying_context": context,
            "clarification_count": state.get("clarification_count", 0) + 1,
            "stage": WorkflowStage.CLARIFICATION,
            "node_trace": state.get("node_trace", []) + ["ask_clarifying_q"],
            "llm_calls": state.get("llm_calls", []) + [{
                "node": "ask_clarifying_q",
                "prompt": prompt[:200],
                "response": raw[:500] if raw else "",
                "timestamp": datetime.utcnow().isoformat()
            }]
        })
        
        logger.info(f"AskClarifyingQ: Question: {clarifying_question}")
        
        # PAUSE: Return state with question, workflow will resume on next user input
        return state
        
    except Exception as e:
        logger.error(f"AskClarifyingQ error: {e}", exc_info=True)
        # Fallback: skip clarification and proceed
        state["clarifying_question"] = None
        state["stage"] = WorkflowStage.SEARCHING
        return state


async def search_marketplaces(state: WorkflowState) -> WorkflowState:
    """
    Node 8: SearchMarketplaces (Tool/Service)
    
    Calls catalog-service to search products across marketplaces
    using the RequirementSpec.
    """
    logger.info(f"SearchMarketplaces: Searching products")
    
    try:
        requirement_spec = state.get("requirement_spec")
        # Recover from session when missing (e.g. resume after clarification with in-memory checkpointer)
        if not requirement_spec:
            session = await session_repo.get_session(state["session_id"])
            if session and session.requirement_spec:
                requirement_spec = session.requirement_spec
                state["requirement_spec"] = requirement_spec
                logger.info(f"SearchMarketplaces: Recovered requirement_spec from session (product_type={requirement_spec.product_type!r})")
        if not requirement_spec:
            # Last resort: build minimal spec from current user message so search can run
            user_message = state.get("user_message", "")
            requirement_spec = _fallback_requirement_spec_from_message(user_message)
            state["requirement_spec"] = requirement_spec
            logger.warning(f"SearchMarketplaces: No requirement_spec in state or session; using fallback from user_message (product_type={requirement_spec.product_type!r})")
        
        if not requirement_spec:
            logger.error("SearchMarketplaces: No requirement spec available")
            state["error"] = "Cannot search without requirements"
            state["stage"] = WorkflowStage.FAILED
            return state
        
        # Call catalog service
        query_desc = f"product_type={requirement_spec.product_type!r} brands={requirement_spec.brand_preferences!r}"
        logger.info(f"SearchMarketplaces: Calling catalog with {query_desc}")
        results = await catalog_client.search_products(requirement_spec)
        count = len(results.products)
        state.update({
            "raw_search_results": results,
            "stage": WorkflowStage.SEARCHING,
            "node_trace": state.get("node_trace", []) + ["search_marketplaces"],
        })
        if count == 0:
            logger.warning(f"SearchMarketplaces: Catalog returned 0 products for {query_desc}. Check catalog logs and RAPIDAPI_KEY.")
        logger.info(f"SearchMarketplaces: Found {count} results")
        return state
        
    except Exception as e:
        logger.error(f"SearchMarketplaces error: {e}", exc_info=True)
        state["error"] = str(e)
        state["raw_search_results"] = []
        return state


async def rank_and_compose(state: WorkflowState) -> WorkflowState:
    """
    Node 9: RankAndCompose (Tool/Service)
    
    Ranks search results by price, rating, ETA and composes
    the final response with ResultCard DTOs.
    """
    logger.info(f"RankAndCompose: Ranking and composing response")
    
    try:
        raw_results_obj = state.get("raw_search_results", [])
        requirement_spec = state.get("requirement_spec")
        
        # Normalize to a list of ProductResult
        if hasattr(raw_results_obj, "products"):
            products_list = list(raw_results_obj.products)
        else:
            products_list = raw_results_obj if isinstance(raw_results_obj, list) else []
        
        if not products_list:
            final_response = (
                "We couldn't find any products matching your search. "
                "Try updating your criteria—for example, a different style, price range, or brand—and I'll search again."
            )
            state.update({
                "ranked_results": [],
                "final_response": final_response,
                "stage": WorkflowStage.RANKING,
                "node_trace": state.get("node_trace", []) + ["rank_and_compose"],
            })
            return state
        
        # Rank by composite score (price, rating)
        def rank_score(product: ProductResult) -> float:
            price_val = product.price if product.price is not None else 999999
            rating_val = product.rating if product.rating is not None else 0
            price_score = 1.0 / (1.0 + price_val)
            rating_score = rating_val / 5.0
            return (price_score * 0.4) + (rating_score * 0.6)
        
        sorted_results = sorted(products_list, key=rank_score, reverse=True)
        ranked_results = sorted_results[:TOP_N_RESULTS]
        
        # Compose response
        final_response = f"I found {len(ranked_results)} products matching your search for '{requirement_spec.product_type if requirement_spec else 'your query'}'. Here are the top results:"
        
        state.update({
            "ranked_results": ranked_results,
            "final_response": final_response,
            "stage": WorkflowStage.RANKING,
            "node_trace": state.get("node_trace", []) + ["rank_and_compose"],
        })
        
        logger.info(f"RankAndCompose: Ranked {len(ranked_results)} products")
        return state
        
    except Exception as e:
        logger.error(f"RankAndCompose error: {e}", exc_info=True)
        state["error"] = str(e)
        state["ranked_results"] = []
        state["final_response"] = "An error occurred while ranking results."
        return state


async def asl_retry_reply(state: WorkflowState) -> WorkflowState:
    """
    Short-circuit when the ASL service returned "I didn't catch that sign clearly".
    Reply with a simple message and go to done (no requirement building).
    """
    logger.info("ASL retry: replying with try-again message (skipping requirement building)")
    state.update({
        "final_response": "I didn't catch that sign clearly. Please try your sign again with a clear, full sign in good lighting.",
        "node_trace": state.get("node_trace", []) + ["asl_retry_reply"],
    })
    return state


async def done(state: WorkflowState) -> WorkflowState:
    """
    Node 10: Done (Terminal)
    
    Final node: Marks workflow as COMPLETED and returns final response.
    """
    logger.info(f"Done: Completing workflow for session {state['session_id']}")
    
    state.update({
        "stage": WorkflowStage.COMPLETED,
        "completed_at": datetime.utcnow(),
        "node_trace": state.get("node_trace", []) + ["done"],
    })
    
    # Update session in DynamoDB
    await session_repo.update_session(
        state["session_id"],
        stage=WorkflowStage.COMPLETED.value,
        final_response=state.get("final_response"),
        completed_at=datetime.utcnow().isoformat(),
    )
    
    num_results = len(state.get("ranked_results", []))
    if num_results == 0:
        logger.warning(
            "Done: 0 results — catalog search returned no products. "
            "Check SearchMarketplaces log for query sent and catalog/catalog-service logs for RapidAPI."
        )
    logger.info(f"Done: Workflow completed, returned {num_results} results")
    return state






