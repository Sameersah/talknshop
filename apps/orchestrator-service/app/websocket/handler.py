"""
WebSocket message handler for processing user messages.

This is a simplified handler that demonstrates the WebSocket flow.
Full LangGraph integration will be added in the graph nodes implementation.
"""

import logging
import asyncio
from datetime import datetime
from fastapi import WebSocket
from typing import Dict, Any, Optional

from app.websocket.manager import manager
from app.models.enums import EventType
from app.models.schemas import ClientMessage
from app.db.dynamodb import session_repo
from app.models.enums import WorkflowStage, RequestType
from app.graph.graph import buyer_flow_graph

logger = logging.getLogger(__name__)


async def handle_websocket_messages(
    websocket: WebSocket,
    session_id: str,
    user_id: str
) -> None:
    """
    Handle incoming WebSocket messages from client.
    
    Args:
        websocket: WebSocket connection
        session_id: Session identifier
        user_id: User identifier
    """
    logger.info(
        "Starting message handler",
        extra={"session_id": session_id, "user_id": user_id}
    )
    
    try:
        # Get or create session
        session = await session_repo.get_session(session_id)
        if not session:
            logger.info(f"Creating new session: {session_id}")
            session = await session_repo.create_session(
                session_id=session_id,
                user_id=user_id,
                request_type=RequestType.CHAT
            )
        
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            
            try:
                client_msg = ClientMessage(**data)
                logger.debug(
                    f"Received message type: {client_msg.type}",
                    extra={"session_id": session_id, "type": client_msg.type}
                )
                
                # Handle different message types
                if client_msg.type == EventType.PONG:
                    # Heartbeat response
                    metadata = manager.get_session_metadata(session_id)
                    if metadata:
                        metadata.update_heartbeat()
                    continue
                
                elif client_msg.type in [EventType.MESSAGE, EventType.ANSWER]:
                    # Process user message through LangGraph (streaming)
                    await process_user_message(
                        session_id,
                        user_id,
                        client_msg
                    )
                
                elif client_msg.type == EventType.DISCONNECT:
                    logger.info(f"Client requested disconnect: {session_id}")
                    break
                
                else:
                    logger.warning(
                        f"Unknown message type: {client_msg.type}",
                        extra={"session_id": session_id}
                    )
            
            except Exception as e:
                logger.error(
                    f"Error processing message: {str(e)}",
                    extra={"session_id": session_id},
                    exc_info=True
                )
                
                # Send error to client
                await manager.send_event(
                    session_id,
                    EventType.ERROR,
                    {
                        "error": "Failed to process message",
                        "details": str(e),
                        "recoverable": True
                    }
                )
    
    except Exception as e:
        logger.error(
            f"Message handler error: {str(e)}",
            extra={"session_id": session_id},
            exc_info=True
        )
        raise


async def process_user_message(
    session_id: str,
    user_id: str,
    client_msg: ClientMessage
) -> None:
    """
    Process a user message through the LangGraph workflow and stream events.
    """
    try:
        logger.info(
            "Processing user message",
            extra={
                "session_id": session_id,
                "message_length": len(client_msg.message) if client_msg.message else 0,
                "media_count": len(client_msg.media)
            }
        )
        
        # Send thinking indicator
        await manager.send_event(
            session_id,
            EventType.THINKING,
            {"message": "Processing your request..."}
        )
        
        # Update session with incoming message
        await session_repo.update_session(
            session_id,
            last_message=client_msg.message,
            workflow_stage=WorkflowStage.REQUIREMENT_BUILDING
        )
        
        # Determine whether this is a new turn or a clarification response
        is_resume = client_msg.type == EventType.ANSWER
        
        # Stream LangGraph execution events to the client
        await stream_workflow_events(session_id, user_id, client_msg, is_resume=is_resume)
        
        logger.info(
            "Message processing completed",
            extra={"session_id": session_id}
        )
    
    except Exception as e:
        logger.error(
            f"Failed to process message: {str(e)}",
            extra={"session_id": session_id},
            exc_info=True
        )
        
        await manager.send_event(
            session_id,
            EventType.ERROR,
            {
                "error": "Failed to process your message",
                "details": str(e),
                "recoverable": True
            }
        )
        
        await session_repo.update_session(
            session_id,
            workflow_stage=WorkflowStage.FAILED
        )


async def stream_workflow_events(
    session_id: str,
    user_id: str,
    client_msg: ClientMessage,
    is_resume: bool = False
) -> None:
    """
    Stream LangGraph events to the WebSocket client.
    
    Args:
        session_id: Session identifier
        user_id: User identifier
        client_msg: Message from client
        is_resume: Whether this is a resume after clarification
    """
    # Base state shared across invocations
    base_state: Dict[str, Any] = {
        "session_id": session_id,
        "user_id": user_id,
        "media_refs": client_msg.media or [],
        "node_trace": [],
        "llm_calls": [],
        "retry_count": 0,
    }
    
    # Initial or resume payload
    initial_state: Dict[str, Any] = {
        **base_state,
        "user_message": client_msg.message or "",
    }
    
    if is_resume:
        # When resuming, clear clarification flags so graph continues
        initial_state.update({
            "needs_clarification": False,
        })
    
    config = {"configurable": {"thread_id": session_id}}
    final_state: Optional[Dict[str, Any]] = None
    clarification_state: Optional[Dict[str, Any]] = None
    
    # langgraph astream_events requires explicit version kwarg for streaming
    async for event in buyer_flow_graph.astream_events(initial_state, config=config, version="v1"):
        event_type = event.get("event")
        node_name = event.get("name")
        data = event.get("data", {})
        
        # Node started
        if event_type == "on_chain_start":
            await manager.send_event(
                session_id,
                EventType.PROGRESS,
                {
                    "step": node_name,
                    "message": f"Executing: {node_name}"
                }
            )
        
        # Streamed LLM tokens
        elif event_type == "on_chat_model_stream":
            chunk = data.get("chunk")
            content = getattr(chunk, "content", None) or getattr(chunk, "text", None)
            if content:
                await manager.send_event(
                    session_id,
                    EventType.TOKEN,
                    {
                        "content": content,
                        "is_complete": False
                    },
                    log_event=False
                )
        
        # Node completed
        elif event_type == "on_chain_end":
            output = data.get("output", {})
            
            if node_name == "ask_clarifying_q":
                clarification_state = output
                await manager.send_event(
                    session_id,
                    EventType.CLARIFICATION,
                    {
                        "question": output.get("clarifying_question"),
                        "context": output.get("clarification_reason"),
                        "suggestions": []
                    }
                )
                # Clarification pauses the workflow; exit streaming loop
                break
            
            if node_name == "search_marketplaces":
                raw_results = output.get("raw_search_results")
                count = len(raw_results.products) if hasattr(raw_results, "products") else len(raw_results or [])
                await manager.send_event(
                    session_id,
                    EventType.PROGRESS,
                    {
                        "step": "search_complete",
                        "message": f"Found {count} products"
                    }
                )
            
            if node_name == "rank_and_compose":
                await manager.send_event(
                    session_id,
                    EventType.RESULTS,
                    {
                        "products": [
                            r.model_dump() if hasattr(r, "model_dump") else r
                            for r in output.get("ranked_results", [])
                        ],
                        "requirement_spec": output.get("requirement_spec").model_dump() if output.get("requirement_spec") else None,
                        "final_response": output.get("final_response"),
                    }
                )
            
            if node_name == "done":
                final_state = output
        
        # Graph ended
        elif event_type == "on_end":
            final_state = data.get("output", final_state)
    
    # If clarification was requested, stop here (client will send ANSWER to resume)
    if clarification_state:
        return
    
    # Send completion if we reached the end
    if final_state is not None:
        # Ensure results are emitted even if rank_and_compose wasn't caught
        if "ranked_results" in final_state:
            await manager.send_event(
                session_id,
                EventType.RESULTS,
                {
                    "products": [
                        r.model_dump() if hasattr(r, "model_dump") else r
                        for r in final_state.get("ranked_results", [])
                    ],
                    "requirement_spec": final_state.get("requirement_spec").model_dump() if final_state.get("requirement_spec") else None,
                    "final_response": final_state.get("final_response"),
                }
            )
        
        await manager.send_event(
            session_id,
            EventType.DONE,
            {
                "message": final_state.get("final_response") or "Search completed",
                "session_id": session_id
            }
        )






