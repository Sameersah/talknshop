"""
TalknShop Orchestrator Service - Main Application

WebSocket-based real-time conversational product search orchestrator.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.aws_clients import verify_aws_connectivity
from app.core.errors import map_error_to_http
from app.models.schemas import HealthResponse
from app.websocket.manager import manager
from app.services.media_client import media_client
from app.services.catalog_client import catalog_client

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle management for the application."""
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"AWS Region: {settings.aws_region}")
    
    # Verify AWS connectivity
    aws_status = await verify_aws_connectivity()
    for service, status in aws_status.items():
        if status:
            logger.info(f"✓ {service} connected")
        else:
            logger.warning(f"✗ {service} not available")
    
    yield
    
    # Shutdown
    logger.info("Shutting down orchestrator service")
    await manager.shutdown()
    await media_client.close()
    await catalog_client.close()
    logger.info("Shutdown complete")


# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Real-time conversational product search orchestrator with WebSocket support",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Exception Handlers
# =============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    """Global exception handler."""
    logger.error(
        f"Unhandled exception: {str(exc)}",
        exc_info=True,
        extra={"path": request.url.path}
    )
    http_exc = map_error_to_http(exc)
    return JSONResponse(
        status_code=http_exc.status_code,
        content=http_exc.detail
    )


# =============================================================================
# HTTP Endpoints
# =============================================================================

@app.get("/", tags=["root"])
async def root():
    """Root endpoint."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "environment": settings.environment
    }


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """
    Health check endpoint.
    
    Returns service health and AWS service connectivity status.
    """
    aws_status = await verify_aws_connectivity()
    
    # Determine overall health
    critical_services = ["bedrock", "dynamodb", "sessions_table"]
    all_critical_healthy = all(aws_status.get(s, False) for s in critical_services)
    
    return HealthResponse(
        status="healthy" if all_critical_healthy else "degraded",
        version=settings.app_version,
        environment=settings.environment,
        aws_services=aws_status
    )


@app.get("/metrics", tags=["monitoring"])
async def metrics():
    """
    Application metrics endpoint.
    
    Returns connection counts and service statistics.
    """
    return {
        "active_connections": manager.get_connection_count(),
        "media_service_healthy": await media_client.health_check(),
        "catalog_service_healthy": await catalog_client.health_check(),
    }


# =============================================================================
# WebSocket Endpoint
# =============================================================================

@app.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for real-time chat.
    
    Query Parameters:
        - session_id: Optional session ID to resume
        - user_id: User identifier (required)
    
    Message Format (Client -> Server):
        {
            "type": "message" | "answer" | "pong",
            "message": "user message text",
            "media": [{"media_type": "image", "s3_key": "..."}],
            "session_id": "optional"
        }
    
    Event Format (Server -> Client):
        {
            "type": "connected" | "progress" | "token" | "clarification" | "results" | "done" | "error" | "ping",
            "data": {...},
            "timestamp": "2025-10-24T10:00:00Z",
            "session_id": "sess_123"
        }
    """
    # Extract parameters
    session_id = websocket.query_params.get("session_id")
    user_id = websocket.query_params.get("user_id", "anonymous")
    
    # Generate session ID if not provided
    if not session_id:
        import uuid
        session_id = f"sess_{uuid.uuid4().hex[:12]}"
    
    logger.info(
        "WebSocket connection request",
        extra={"session_id": session_id, "user_id": user_id}
    )
    
    try:
        # Connect and register
        await manager.connect(websocket, session_id, user_id)
        
        # Import here to avoid circular imports
        from app.websocket.handler import handle_websocket_messages
        
        # Handle messages
        await handle_websocket_messages(websocket, session_id, user_id)
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected normally: {session_id}")
        await manager.disconnect(session_id, "Client disconnected")
    
    except Exception as e:
        logger.error(
            f"WebSocket error: {str(e)}",
            extra={"session_id": session_id},
            exc_info=True
        )
        await manager.disconnect(session_id, f"Error: {str(e)}")


# =============================================================================
# Session Management Endpoints
# =============================================================================

@app.get("/api/v1/sessions/{session_id}", tags=["sessions"])
async def get_session_info(session_id: str):
    """
    Get session information.
    
    Returns current session state and connection status.
    """
    from app.db.dynamodb import session_repo
    from app.models.schemas import SessionResponse
    
    session = await session_repo.get_session(session_id)
    if not session:
        return JSONResponse(
            status_code=404,
            content={"error": "Session not found"}
        )
    
    return SessionResponse(
        session=session,
        active=manager.is_connected(session_id),
        connection_count=len(manager.get_user_sessions(session.user_id))
    )


# =============================================================================
# Development/Debug Endpoints
# =============================================================================

if settings.debug:
    @app.get("/debug/connections", tags=["debug"])
    async def debug_connections():
        """Debug endpoint to view active connections."""
        return {
            "total_connections": manager.get_connection_count(),
            "connections": {
                session_id: {
                    "user_id": metadata.user_id,
                    "connected_at": metadata.connected_at.isoformat(),
                    "message_count": metadata.message_count,
                    "duration_seconds": metadata.get_connection_duration()
                }
                for session_id, metadata in manager.connection_metadata.items()
            }
        }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
