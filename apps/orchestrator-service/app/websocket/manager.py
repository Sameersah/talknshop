"""
WebSocket connection manager for the orchestrator service.

Manages active WebSocket connections, heartbeats, and message routing.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
from fastapi import WebSocket
import json

from app.core.config import settings
from app.core.errors import WebSocketError
from app.models.enums import EventType
from app.models.schemas import ServerEvent

logger = logging.getLogger(__name__)


class ConnectionMetadata:
    """Metadata for an active WebSocket connection."""
    
    def __init__(self, user_id: str, session_id: str):
        self.user_id = user_id
        self.session_id = session_id
        self.connected_at = datetime.utcnow()
        self.last_heartbeat = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        self.message_count = 0
        self.error_count = 0
    
    def update_heartbeat(self) -> None:
        """Update last heartbeat timestamp."""
        self.last_heartbeat = datetime.utcnow()
    
    def update_activity(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = datetime.utcnow()
    
    def increment_message_count(self) -> None:
        """Increment message counter."""
        self.message_count += 1
    
    def increment_error_count(self) -> None:
        """Increment error counter."""
        self.error_count += 1
    
    def is_stale(self, timeout_seconds: int = 300) -> bool:
        """Check if connection is stale (no activity)."""
        return datetime.utcnow() - self.last_activity > timedelta(seconds=timeout_seconds)
    
    def is_heartbeat_overdue(self) -> bool:
        """Check if heartbeat is overdue."""
        timeout = settings.ws_heartbeat_interval * 2  # Allow 2x interval before considering overdue
        return datetime.utcnow() - self.last_heartbeat > timedelta(seconds=timeout)
    
    def get_connection_duration(self) -> float:
        """Get connection duration in seconds."""
        return (datetime.utcnow() - self.connected_at).total_seconds()


class ConnectionManager:
    """
    Manages active WebSocket connections.
    
    Features:
    - Connection tracking and metadata
    - Heartbeat/ping-pong mechanism
    - Message broadcasting
    - Connection cleanup
    - Error handling
    """
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.connection_metadata: Dict[str, ConnectionMetadata] = {}
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        
        logger.info("ConnectionManager initialized")
    
    async def connect(
        self,
        websocket: WebSocket,
        session_id: str,
        user_id: str
    ) -> None:
        """
        Accept and register a new WebSocket connection.
        
        Args:
            websocket: FastAPI WebSocket instance
            session_id: Unique session identifier
            user_id: User identifier
            
        Raises:
            WebSocketError: If connection fails
        """
        try:
            await websocket.accept()
            
            async with self._lock:
                # Check connection limit
                if len(self.active_connections) >= settings.ws_max_concurrent_connections:
                    logger.warning(
                        f"Connection limit reached ({settings.ws_max_concurrent_connections})",
                        extra={"user_id": user_id, "session_id": session_id}
                    )
                    await websocket.close(code=1008, reason="Connection limit reached")
                    raise WebSocketError("Maximum concurrent connections reached")
                
                # Register connection
                self.active_connections[session_id] = websocket
                self.connection_metadata[session_id] = ConnectionMetadata(user_id, session_id)
            
            # Start heartbeat
            heartbeat_task = asyncio.create_task(self._heartbeat_loop(session_id))
            self._heartbeat_tasks[session_id] = heartbeat_task
            
            # Start cleanup task if not running
            if self._cleanup_task is None or self._cleanup_task.done():
                self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            
            logger.info(
                f"WebSocket connection established",
                extra={
                    "session_id": session_id,
                    "user_id": user_id,
                    "active_connections": len(self.active_connections)
                }
            )
            
            # Send connection confirmation
            await self.send_event(session_id, EventType.CONNECTED, {
                "session_id": session_id,
                "message": "Connected to TalknShop orchestrator",
                "server_time": datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            logger.error(
                f"Failed to establish WebSocket connection: {str(e)}",
                extra={"session_id": session_id, "user_id": user_id},
                exc_info=True
            )
            raise WebSocketError(f"Connection failed: {str(e)}") from e
    
    async def disconnect(self, session_id: str, reason: str = "Client disconnected") -> None:
        """
        Disconnect and cleanup a WebSocket connection.
        
        Args:
            session_id: Session identifier
            reason: Disconnection reason for logging
        """
        async with self._lock:
            metadata = self.connection_metadata.get(session_id)
            
            # Cancel heartbeat task
            if session_id in self._heartbeat_tasks:
                self._heartbeat_tasks[session_id].cancel()
                del self._heartbeat_tasks[session_id]
            
            # Remove connection
            if session_id in self.active_connections:
                del self.active_connections[session_id]
            
            # Remove metadata
            if session_id in self.connection_metadata:
                del self.connection_metadata[session_id]
        
        if metadata:
            logger.info(
                f"WebSocket connection closed: {reason}",
                extra={
                    "session_id": session_id,
                    "user_id": metadata.user_id,
                    "duration_seconds": metadata.get_connection_duration(),
                    "message_count": metadata.message_count,
                    "error_count": metadata.error_count,
                    "active_connections": len(self.active_connections)
                }
            )
    
    async def send_event(
        self,
        session_id: str,
        event_type: EventType,
        data: Dict,
        log_event: bool = True
    ) -> bool:
        """
        Send event to a specific connection.
        
        Args:
            session_id: Session identifier
            event_type: Type of event
            data: Event data
            log_event: Whether to log the event
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if session_id not in self.active_connections:
            logger.warning(f"Cannot send event: session {session_id} not connected")
            return False
        
        try:
            websocket = self.active_connections[session_id]
            metadata = self.connection_metadata.get(session_id)
            
            event = ServerEvent(
                type=event_type,
                data=data,
                timestamp=datetime.utcnow(),
                session_id=session_id
            )
            
            await websocket.send_json(event.model_dump(mode='json'))
            
            if metadata:
                metadata.update_activity()
                metadata.increment_message_count()
            
            if log_event and event_type not in [EventType.PING, EventType.TOKEN]:
                logger.debug(
                    f"Sent WebSocket event: {event_type}",
                    extra={"session_id": session_id, "event_type": event_type}
                )
            
            return True
            
        except Exception as e:
            logger.error(
                f"Failed to send WebSocket event: {str(e)}",
                extra={"session_id": session_id, "event_type": event_type},
                exc_info=True
            )
            
            if metadata:
                metadata.increment_error_count()
            
            # Close connection on send error
            await self.disconnect(session_id, f"Send error: {str(e)}")
            return False
    
    async def broadcast_to_user(
        self,
        user_id: str,
        event_type: EventType,
        data: Dict
    ) -> int:
        """
        Broadcast event to all sessions of a user.
        
        Args:
            user_id: User identifier
            event_type: Type of event
            data: Event data
            
        Returns:
            int: Number of successful sends
        """
        sessions = [
            session_id for session_id, metadata in self.connection_metadata.items()
            if metadata.user_id == user_id
        ]
        
        successful_sends = 0
        for session_id in sessions:
            if await self.send_event(session_id, event_type, data):
                successful_sends += 1
        
        return successful_sends
    
    def get_user_sessions(self, user_id: str) -> List[str]:
        """Get all active sessions for a user."""
        return [
            session_id for session_id, metadata in self.connection_metadata.items()
            if metadata.user_id == user_id
        ]
    
    def get_connection_count(self) -> int:
        """Get number of active connections."""
        return len(self.active_connections)
    
    def get_session_metadata(self, session_id: str) -> Optional[ConnectionMetadata]:
        """Get metadata for a session."""
        return self.connection_metadata.get(session_id)
    
    def is_connected(self, session_id: str) -> bool:
        """Check if session is connected."""
        return session_id in self.active_connections
    
    async def _heartbeat_loop(self, session_id: str) -> None:
        """
        Send periodic heartbeats to keep connection alive.
        
        Args:
            session_id: Session identifier
        """
        try:
            while session_id in self.active_connections:
                await asyncio.sleep(settings.ws_heartbeat_interval)
                
                if session_id in self.active_connections:
                    await self.send_event(
                        session_id,
                        EventType.PING,
                        {"timestamp": datetime.utcnow().isoformat()},
                        log_event=False
                    )
                    
        except asyncio.CancelledError:
            logger.debug(f"Heartbeat cancelled for session {session_id}")
        except Exception as e:
            logger.error(
                f"Heartbeat error for session {session_id}: {str(e)}",
                exc_info=True
            )
            await self.disconnect(session_id, f"Heartbeat error: {str(e)}")
    
    async def _cleanup_loop(self) -> None:
        """Periodic cleanup of stale connections."""
        try:
            while True:
                await asyncio.sleep(60)  # Run cleanup every minute
                
                stale_sessions = []
                async with self._lock:
                    for session_id, metadata in self.connection_metadata.items():
                        if metadata.is_stale() or metadata.is_heartbeat_overdue():
                            stale_sessions.append(session_id)
                
                for session_id in stale_sessions:
                    logger.warning(f"Closing stale connection: {session_id}")
                    await self.disconnect(session_id, "Stale connection")
                
                if stale_sessions:
                    logger.info(f"Cleaned up {len(stale_sessions)} stale connections")
                    
        except asyncio.CancelledError:
            logger.info("Cleanup loop cancelled")
        except Exception as e:
            logger.error(f"Cleanup loop error: {str(e)}", exc_info=True)
    
    async def shutdown(self) -> None:
        """Gracefully shutdown all connections."""
        logger.info(f"Shutting down ConnectionManager ({len(self.active_connections)} active connections)")
        
        # Cancel cleanup task
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
        
        # Disconnect all connections
        sessions = list(self.active_connections.keys())
        for session_id in sessions:
            await self.disconnect(session_id, "Server shutdown")
        
        logger.info("ConnectionManager shutdown complete")


# Global connection manager instance
manager = ConnectionManager()

