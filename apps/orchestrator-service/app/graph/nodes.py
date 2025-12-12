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

import logging
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
        
        # Extract turn input
        # TurnInput requires message; map from user_message
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
            "clarification_count": state.get("clarification_count", 0),
            "node_trace": state.get("node_trace", []) + ["parse_input"],
            "updated_at": datetime.utcnow(),
        })
        
        logger.info(f"ParseInput: Parsed input with {len(media_refs)} media refs")
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
            state.update({
                "need_stt": False,
                "need_vision": False,
                "stage": WorkflowStage.REQUIREMENT_BUILDING,
                "node_trace": state.get("node_trace", []) + ["need_media_ops"],
            })
            return state
        
        # Build prompt with media context
        media_info = format_media_info([
            ref.dict() if hasattr(ref, "dict") else ref for ref in media_refs
        ])
        
        prompt = NEED_MEDIA_OPS_PROMPT.format(
            message=user_message,
            media_info=media_info,
        )
        
        # Call Bedrock
        llm = ChatBedrock(
            client=get_bedrock_client(),
            model_id=settings.bedrock_model_id,
            model_kwargs={"temperature": 0.1, "max_tokens": 500}
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
        # Parse response (expecting JSON: {"need_stt": bool, "need_vision": bool})
        import json
        result = json.loads(response.content)
        
        state.update({
            "need_stt": result.get("need_stt", False) and has_audio,
            "need_vision": result.get("need_vision", False) and has_image,
            "stage": WorkflowStage.MEDIA_PROCESSING,
            "node_trace": state.get("node_trace", []) + ["need_media_ops"],
            "llm_calls": state.get("llm_calls", []) + [{
                "node": "need_media_ops",
                "prompt": prompt[:200],
                "response": response.content,
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
        audio_refs = [ref for ref in media_refs if ref.category == "AUDIO"]
        
        if not audio_refs:
            logger.warning("TranscribeAudio: No audio refs found")
            return state
        
        # Transcribe first audio file (can extend to multiple)
        audio_ref = audio_refs[0]
        transcript = await media_client.transcribe_audio(audio_ref.s3_key)
        
        state.update({
            "audio_transcript": transcript.get("transcript", ""),
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
    logger.info(f"ExtractImageAttrs: Extracting image attributes")
    
    try:
        media_refs = state.get("media_refs", [])
        image_refs = [ref for ref in media_refs if ref.category == "IMAGE"]
        
        if not image_refs:
            logger.warning("ExtractImageAttrs: No image refs found")
            return state
        
        # Process first image (can extend to multiple)
        image_ref = image_refs[0]
        attributes = await media_client.extract_image_attributes(image_ref.s3_key)
        
        state.update({
            "image_attributes": attributes,
            "node_trace": state.get("node_trace", []) + ["extract_image_attrs"],
        })
        
        logger.info(f"ExtractImageAttrs: Extracted {len(attributes)} attributes")
        return state
        
    except Exception as e:
        logger.error(f"ExtractImageAttrs error: {e}", exc_info=True)
        state["image_attributes"] = None
        return state


async def build_or_update_requirement_spec(state: WorkflowState) -> WorkflowState:
    """
    Node 5: BuildOrUpdateRequirementSpec (Agent/LLM)
    
    Critical node: Uses Bedrock to extract structured RequirementSpec
    from natural language (text + media results).
    """
    logger.info(f"BuildRequirement: Building requirement spec")
    
    try:
        user_message = state.get("user_message", "")
        audio_transcript = state.get("audio_transcript", "")
        image_attributes = state.get("image_attributes", {})
        existing_spec = state.get("requirement_spec")
        
        if settings.use_mock_services:
            # Local mock: build a simple spec without Bedrock
            inferred_type = (user_message or "product").split(" ")[0][:40] or "product"
            requirement_spec = RequirementSpec(
                product_type=inferred_type,
                attributes={"mock": True},
                filters={"price": {"max": 1000}},
                brand_preferences=[]
            )
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
            llm = ChatBedrock(
                client=get_bedrock_client(),
                model_id=settings.bedrock_model_id,
                model_kwargs={"temperature": 0.2, "max_tokens": 1000}
            )
            
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            
            # Parse RequirementSpec from response
            import json
            spec_data = json.loads(response.content)
            requirement_spec = RequirementSpec(**spec_data)
        
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
                "response": response.content,
                "timestamp": datetime.utcnow().isoformat()
            }]
        })
        
        logger.info(f"BuildRequirement: Created spec for {requirement_spec.product_type}")
        return state
        
    except Exception as e:
        logger.error(f"BuildRequirement error: {e}", exc_info=True)
        state["error"] = str(e)
        state["stage"] = WorkflowStage.FAILED
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

        if not has_product_type or not has_constraint:
            missing = []
            if not has_product_type:
                missing.append("product type")
            if not has_constraint:
                missing.append("at least one constraint (budget, brand, or key feature)")
            reason = "Missing " + " and ".join(missing)

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
        llm = ChatBedrock(
            client=get_bedrock_client(),
            model_id=settings.bedrock_model_id,
            model_kwargs={"temperature": 0.1, "max_tokens": 300}
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
        # Parse response: {"needs_clarification": bool, "reason": str}
        import json
        result = json.loads(response.content)
        
        state.update({
            "needs_clarification": result.get("needs_clarification", False),
            "clarification_reason": result.get("reason", ""),
            "stage": WorkflowStage.CLARIFICATION if result.get("needs_clarification") else WorkflowStage.SEARCHING,
            "node_trace": state.get("node_trace", []) + ["need_clarify"],
            "llm_calls": state.get("llm_calls", []) + [{
                "node": "need_clarify",
                "prompt": prompt[:200],
                "response": response.content,
                "timestamp": datetime.utcnow().isoformat()
            }]
        })
        
        logger.info(f"NeedClarify: needs_clarification={state['needs_clarification']}")
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
    logger.info(f"AskClarifyingQ: Generating clarifying question")
    
    try:
        requirement_spec = state.get("requirement_spec")
        clarification_reason = state.get("clarification_reason", "")
        
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
        llm = ChatBedrock(
            client=get_bedrock_client(),
            model_id=settings.bedrock_model_id,
            model_kwargs={"temperature": 0.3, "max_tokens": 200}
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        # Prompt asks for JSON: {"question": "...", "suggestions": [...], "context": "..."}
        raw = response.content.strip()
        clarifying_question = raw
        suggestions = []
        context = None
        try:
            import json
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                clarifying_question = str(parsed.get("question") or raw).strip()
                suggestions = parsed.get("suggestions") or []
                context = parsed.get("context")
        except Exception:
            # If model didn't return JSON, fall back to raw text
            pass
        
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
                "response": response.content,
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
        
        if not requirement_spec:
            logger.error("SearchMarketplaces: No requirement spec available")
            state["error"] = "Cannot search without requirements"
            state["stage"] = WorkflowStage.FAILED
            return state
        
        # Call catalog service
        results = await catalog_client.search_products(requirement_spec)
        
        state.update({
            "raw_search_results": results,
            "stage": WorkflowStage.SEARCHING,
            "node_trace": state.get("node_trace", []) + ["search_marketplaces"],
        })
        
        logger.info(f"SearchMarketplaces: Found {len(results.products)} results")
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
            final_response = "I couldn't find any products matching your requirements. Would you like to adjust your criteria?"
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
        ranked_results = sorted_results[:10]  # Top 10
        
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
    
    logger.info(f"Done: Workflow completed, returned {len(state.get('ranked_results', []))} results")
    return state






