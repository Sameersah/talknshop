"""
LangGraph State Definition

Defines the WorkflowState TypedDict that flows through all nodes in the buyer flow graph.
This state is persisted to DynamoDB at each checkpoint.
"""

from typing import TypedDict, Optional, Any
from datetime import datetime

from app.models.schemas import (
    RequirementSpec,
    TurnInput,
    MediaReference,
    ProductResult,
)
from app.models.enums import WorkflowStage


class WorkflowState(TypedDict, total=False):
    """
    State object that flows through the LangGraph state machine.
    
    This state is persisted to DynamoDB after each node execution,
    allowing the workflow to resume from any point.
    """
    
    # Session identifiers
    session_id: str
    user_id: str
    request_id: str
    
    # Current workflow stage
    stage: WorkflowStage
    
    # User input for current turn
    turn_input: TurnInput
    user_message: str
    media_refs: list[MediaReference]
    
    # Media processing results
    need_stt: bool
    need_vision: bool
    audio_transcript: Optional[str]
    image_attributes: Optional[dict[str, Any]]
    
    # Requirement building
    requirement_spec: Optional[RequirementSpec]
    requirement_history: list[RequirementSpec]  # Track evolution
    
    # Clarification flow
    needs_clarification: bool
    clarification_reason: Optional[str]
    clarifying_question: Optional[str]
    clarification_count: int  # Limit clarification loops
    
    # Search and ranking
    raw_search_results: list[dict[str, Any]]
    ranked_results: list[ProductResult]
    
    # Response composition
    final_response: Optional[str]
    response_metadata: Optional[dict[str, Any]]
    
    # Error handling
    error: Optional[str]
    error_details: Optional[dict[str, Any]]
    retry_count: int
    
    # Timestamps for monitoring
    started_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    
    # Debugging and observability
    node_trace: list[str]  # Track node execution order
    llm_calls: list[dict[str, Any]]  # Log all LLM interactions






