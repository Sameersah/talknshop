"""
LangGraph State Machine Assembly

Builds the buyer flow state graph, connecting all 10 nodes with
conditional edges and DynamoDB persistence.

Graph Flow:
START -> ParseInput -> NeedMediaOps -> [TranscribeAudio, ExtractImageAttrs] 
      -> BuildRequirement -> NeedClarify -> [AskClarifyingQ (loop) | SearchMarketplaces] 
      -> RankAndCompose -> Done -> END
"""

import logging
from typing import Literal

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.core.aws_clients import get_checkpoints_table
from app.core.config import settings
from app.graph.state import WorkflowState
from app.graph.nodes import (
    parse_input,
    need_media_ops,
    transcribe_audio,
    extract_image_attrs,
    build_or_update_requirement_spec,
    need_clarify,
    ask_clarifying_question,
    search_marketplaces,
    rank_and_compose,
    done,
)

# Optional DynamoDBSaver import (if package installed)
try:
    from langgraph.checkpoint.dynamodb import DynamoDBSaver  # type: ignore
except ImportError:
    DynamoDBSaver = None

logger = logging.getLogger(__name__)


def should_process_audio(state: WorkflowState) -> Literal["transcribe_audio", "skip_audio"]:
    """Conditional edge: Process audio if need_stt is True."""
    return "transcribe_audio" if state.get("need_stt", False) else "skip_audio"


def should_process_image(state: WorkflowState) -> Literal["extract_image_attrs", "skip_image"]:
    """Conditional edge: Process image if need_vision is True."""
    return "extract_image_attrs" if state.get("need_vision", False) else "skip_image"


def should_clarify(state: WorkflowState) -> Literal["ask_clarifying_q", "search_marketplaces"]:
    """Conditional edge: Ask clarification or proceed to search."""
    return "ask_clarifying_q" if state.get("needs_clarification", False) else "search_marketplaces"


def build_buyer_flow_graph() -> StateGraph:
    """
    Build and compile the buyer flow state graph.
    
    Returns:
        Compiled StateGraph ready for invocation
    """
    logger.info("Building buyer flow graph...")
    
    # Initialize graph with WorkflowState
    graph = StateGraph(WorkflowState)
    
    # Add all nodes
    graph.add_node("parse_input", parse_input)
    graph.add_node("need_media_ops", need_media_ops)
    graph.add_node("transcribe_audio", transcribe_audio)
    graph.add_node("extract_image_attrs", extract_image_attrs)
    graph.add_node("build_requirement", build_or_update_requirement_spec)
    graph.add_node("need_clarify", need_clarify)
    graph.add_node("ask_clarifying_q", ask_clarifying_question)
    graph.add_node("search_marketplaces", search_marketplaces)
    graph.add_node("rank_and_compose", rank_and_compose)
    graph.add_node("done", done)
    
    # Set entry point
    graph.set_entry_point("parse_input")
    
    # Define edges
    # parse_input -> need_media_ops
    graph.add_edge("parse_input", "need_media_ops")
    
    # need_media_ops -> [transcribe_audio | skip] (conditional)
    graph.add_conditional_edges(
        "need_media_ops",
        should_process_audio,
        {
            "transcribe_audio": "transcribe_audio",
            "skip_audio": "build_requirement",  # Skip directly to requirement building
        }
    )
    
    # transcribe_audio -> [extract_image_attrs | skip] (conditional)
    graph.add_conditional_edges(
        "transcribe_audio",
        should_process_image,
        {
            "extract_image_attrs": "extract_image_attrs",
            "skip_image": "build_requirement",
        }
    )
    
    # extract_image_attrs -> build_requirement
    graph.add_edge("extract_image_attrs", "build_requirement")
    
    # build_requirement -> need_clarify
    graph.add_edge("build_requirement", "need_clarify")
    
    # need_clarify -> [ask_clarifying_q | search_marketplaces] (conditional)
    graph.add_conditional_edges(
        "need_clarify",
        should_clarify,
        {
            "ask_clarifying_q": "ask_clarifying_q",
            "search_marketplaces": "search_marketplaces",
        }
    )
    
    # ask_clarifying_q -> END (pauses workflow, resumes on next user input)
    # In production, this would return to the user and wait for response
    # For now, we'll loop back to build_requirement after clarification
    graph.add_edge("ask_clarifying_q", END)
    
    # search_marketplaces -> rank_and_compose
    graph.add_edge("search_marketplaces", "rank_and_compose")
    
    # rank_and_compose -> done
    graph.add_edge("rank_and_compose", "done")
    
    # done -> END
    graph.add_edge("done", END)
    
    logger.info("Buyer flow graph built successfully")
    return graph


def compile_buyer_flow_graph() -> StateGraph:
    """
    Compile the buyer flow graph with checkpointing.
    
    In production, replace MemorySaver with DynamoDB checkpointer:
    from langgraph.checkpoint.dynamodb import DynamoDBSaver
    checkpointer = DynamoDBSaver(table_name="orchestrator-checkpoints")
    
    Returns:
        Compiled graph with persistence
    """
    graph = build_buyer_flow_graph()
    
    # Choose checkpointer based on configuration
    if settings.use_memory_checkpointer or DynamoDBSaver is None:
        if DynamoDBSaver is None and not settings.use_memory_checkpointer:
            logger.warning("DynamoDB checkpointer not available; falling back to in-memory checkpointer")
        checkpointer = MemorySaver()
        logger.info("Buyer flow graph compiled with in-memory checkpointer")
    else:
        checkpoints_table = get_checkpoints_table()
        checkpointer = DynamoDBSaver(checkpoints_table)  # type: ignore
        logger.info("Buyer flow graph compiled with DynamoDB checkpointer")
    
    compiled_graph = graph.compile(checkpointer=checkpointer)
    
    return compiled_graph


# Global instance
buyer_flow_graph = compile_buyer_flow_graph()


async def invoke_buyer_flow(
    session_id: str,
    user_id: str,
    user_message: str,
    media_refs: list = None,
) -> WorkflowState:
    """
    Invoke the buyer flow graph with initial input.
    
    Args:
        session_id: Session identifier
        user_id: User identifier
        user_message: User's text message
        media_refs: Optional list of MediaReference objects
        
    Returns:
        Final WorkflowState after graph execution
    """
    logger.info(f"Invoking buyer flow for session {session_id}")
    
    # Initialize state
    initial_state: WorkflowState = {
        "session_id": session_id,
        "user_id": user_id,
        "user_message": user_message,
        "media_refs": media_refs or [],
        "node_trace": [],
        "llm_calls": [],
        "retry_count": 0,
        "clarification_count": 0,
        "started_at": None,  # Will be set in parse_input
        "updated_at": None,
    }
    
    # Invoke graph with checkpointing
    config = {"configurable": {"thread_id": session_id}}
    
    try:
        final_state = await buyer_flow_graph.ainvoke(initial_state, config)
        logger.info(f"Buyer flow completed for session {session_id}")
        return final_state
    except Exception as e:
        logger.error(f"Buyer flow error for session {session_id}: {e}", exc_info=True)
        # Return error state
        initial_state["error"] = str(e)
        initial_state["stage"] = "FAILED"
        return initial_state


async def resume_buyer_flow(
    session_id: str,
    user_message: str,
) -> WorkflowState:
    """
    Resume a paused workflow (e.g., after clarification).
    
    Args:
        session_id: Session identifier to resume
        user_message: User's response to clarification
        
    Returns:
        Updated WorkflowState
    """
    logger.info(f"Resuming buyer flow for session {session_id}")
    
    # Load existing state from checkpointer
    config = {"configurable": {"thread_id": session_id}}
    
    # Update state with new user message
    update_state: WorkflowState = {
        "user_message": user_message,
        "needs_clarification": False,  # Clear clarification flag
    }
    
    try:
        # Resume from checkpoint
        final_state = await buyer_flow_graph.ainvoke(update_state, config)
        logger.info(f"Buyer flow resumed for session {session_id}")
        return final_state
    except Exception as e:
        logger.error(f"Resume buyer flow error for session {session_id}: {e}", exc_info=True)
        raise






