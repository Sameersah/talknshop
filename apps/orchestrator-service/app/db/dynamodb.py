"""
DynamoDB operations for session and state management.

Provides CRUD operations for sessions, requirement specs, and workflow state.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from botocore.exceptions import ClientError
import json

from app.core.aws_clients import get_sessions_table, get_checkpoints_table, DynamoDBClientError
from app.core.errors import SessionNotFoundError, DynamoDBError
from app.models.schemas import SessionState, RequirementSpec, SearchResults
from app.models.enums import WorkflowStage, RequestType

logger = logging.getLogger(__name__)


class SessionRepository:
    """Repository for session operations."""
    
    def __init__(self):
        self.table = get_sessions_table()
    
    async def create_session(
        self,
        session_id: str,
        user_id: str,
        request_type: RequestType = RequestType.CHAT
    ) -> SessionState:
        """
        Create a new session.
        
        Args:
            session_id: Unique session identifier
            user_id: User identifier
            request_type: Type of request
            
        Returns:
            SessionState: Created session state
            
        Raises:
            DynamoDBError: If creation fails
        """
        try:
            now = datetime.utcnow()
            
            session = SessionState(
                session_id=session_id,
                user_id=user_id,
                workflow_stage=WorkflowStage.INITIAL,
                request_type=request_type,
                clarification_count=0,
                created_at=now,
                updated_at=now
            )
            
            item = {
                'pk': session_id,
                'sk': f"SESSION#{session_id}",
                'user_id': user_id,
                'workflow_stage': session.workflow_stage.value,
                'request_type': session.request_type.value,
                'clarification_count': 0,
                'created_at': now.isoformat(),
                'updated_at': now.isoformat(),
                'ttl': int((now + timedelta(hours=24)).timestamp())  # 24h TTL
            }
            
            self.table.put_item(Item=item)
            
            logger.info(
                f"Session created",
                extra={"session_id": session_id, "user_id": user_id}
            )
            
            return session
            
        except ClientError as e:
            logger.error(
                f"Failed to create session: {str(e)}",
                extra={"session_id": session_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to create session: {str(e)}") from e
    
    async def get_session(self, session_id: str) -> Optional[SessionState]:
        """
        Retrieve session by ID.
        
        Args:
            session_id: Session identifier
            
        Returns:
            SessionState: Session state or None if not found
            
        Raises:
            DynamoDBError: If retrieval fails
        """
        try:
            response = self.table.get_item(
                Key={
                    'pk': session_id,
                    'sk': f"SESSION#{session_id}"
                }
            )
            
            item = response.get('Item')
            if not item:
                logger.debug(f"Session not found: {session_id}")
                return None
            
            # Parse requirement spec if exists
            requirement_spec = None
            if 'requirement_spec' in item:
                requirement_spec = RequirementSpec(**json.loads(item['requirement_spec']))
            
            # Parse search results if exists
            search_results = None
            if 'search_results' in item:
                search_results = SearchResults(**json.loads(item['search_results']))
            
            session = SessionState(
                session_id=item['pk'],
                user_id=item['user_id'],
                workflow_stage=WorkflowStage(item['workflow_stage']),
                request_type=RequestType(item.get('request_type', 'chat')),
                requirement_spec=requirement_spec,
                clarification_count=item.get('clarification_count', 0),
                last_message=item.get('last_message'),
                transcript=item.get('transcript'),
                image_attributes=json.loads(item['image_attributes']) if 'image_attributes' in item else None,
                search_results=search_results,
                created_at=datetime.fromisoformat(item['created_at']),
                updated_at=datetime.fromisoformat(item['updated_at']),
                metadata=json.loads(item.get('metadata', '{}'))
            )
            
            logger.debug(f"Session retrieved", extra={"session_id": session_id})
            return session
            
        except ClientError as e:
            logger.error(
                f"Failed to retrieve session: {str(e)}",
                extra={"session_id": session_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to retrieve session: {str(e)}") from e
    
    async def update_session(
        self,
        session_id: str,
        **updates
    ) -> SessionState:
        """
        Update session attributes.
        
        Args:
            session_id: Session identifier
            **updates: Attributes to update
            
        Returns:
            SessionState: Updated session state
            
        Raises:
            SessionNotFoundError: If session doesn't exist
            DynamoDBError: If update fails
        """
        try:
            # Build update expression
            update_expr_parts = []
            expr_attr_names = {}
            expr_attr_values = {}
            
            # Always update timestamp
            updates['updated_at'] = datetime.utcnow().isoformat()
            
            for key, value in updates.items():
                if value is not None:
                    attr_name = f"#{key}"
                    attr_value = f":{key}"
                    update_expr_parts.append(f"{attr_name} = {attr_value}")
                    expr_attr_names[attr_name] = key
                    
                    # Serialize complex objects
                    if isinstance(value, (dict, list)):
                        expr_attr_values[attr_value] = json.dumps(value)
                    elif isinstance(value, datetime):
                        expr_attr_values[attr_value] = value.isoformat()
                    elif hasattr(value, 'value'):  # Enum
                        expr_attr_values[attr_value] = value.value
                    else:
                        expr_attr_values[attr_value] = value
            
            if not update_expr_parts:
                logger.warning(f"No updates provided for session {session_id}")
                session = await self.get_session(session_id)
                if not session:
                    raise SessionNotFoundError(f"Session not found: {session_id}")
                return session
            
            update_expression = "SET " + ", ".join(update_expr_parts)
            
            response = self.table.update_item(
                Key={
                    'pk': session_id,
                    'sk': f"SESSION#{session_id}"
                },
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expr_attr_names,
                ExpressionAttributeValues=expr_attr_values,
                ReturnValues="ALL_NEW"
            )
            
            logger.info(
                f"Session updated",
                extra={"session_id": session_id, "updates": list(updates.keys())}
            )
            
            # Fetch and return updated session
            return await self.get_session(session_id)
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == 'ConditionalCheckFailedException':
                raise SessionNotFoundError(f"Session not found: {session_id}") from e
            
            logger.error(
                f"Failed to update session: {str(e)}",
                extra={"session_id": session_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to update session: {str(e)}") from e
    
    async def save_requirement_spec(
        self,
        session_id: str,
        requirement_spec: RequirementSpec
    ) -> None:
        """
        Save requirement spec to session.
        
        Args:
            session_id: Session identifier
            requirement_spec: Requirement specification
            
        Raises:
            DynamoDBError: If save fails
        """
        try:
            await self.update_session(
                session_id,
                requirement_spec=requirement_spec.model_dump(),
                workflow_stage=WorkflowStage.REQUIREMENT_BUILDING
            )
            
            logger.info(
                f"Requirement spec saved",
                extra={"session_id": session_id, "product_type": requirement_spec.product_type}
            )
            
        except Exception as e:
            logger.error(
                f"Failed to save requirement spec: {str(e)}",
                extra={"session_id": session_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to save requirement spec: {str(e)}") from e
    
    async def save_search_results(
        self,
        session_id: str,
        search_results: SearchResults
    ) -> None:
        """
        Save search results to session.
        
        Args:
            session_id: Session identifier
            search_results: Search results
            
        Raises:
            DynamoDBError: If save fails
        """
        try:
            await self.update_session(
                session_id,
                search_results=search_results.model_dump(),
                workflow_stage=WorkflowStage.COMPLETED
            )
            
            logger.info(
                f"Search results saved",
                extra={"session_id": session_id, "product_count": len(search_results.products)}
            )
            
        except Exception as e:
            logger.error(
                f"Failed to save search results: {str(e)}",
                extra={"session_id": session_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to save search results: {str(e)}") from e
    
    async def increment_clarification_count(self, session_id: str) -> int:
        """
        Increment clarification counter.
        
        Args:
            session_id: Session identifier
            
        Returns:
            int: New clarification count
            
        Raises:
            DynamoDBError: If increment fails
        """
        try:
            response = self.table.update_item(
                Key={
                    'pk': session_id,
                    'sk': f"SESSION#{session_id}"
                },
                UpdateExpression="ADD clarification_count :inc SET updated_at = :now",
                ExpressionAttributeValues={
                    ':inc': 1,
                    ':now': datetime.utcnow().isoformat()
                },
                ReturnValues="UPDATED_NEW"
            )
            
            new_count = response['Attributes']['clarification_count']
            logger.info(
                f"Clarification count incremented",
                extra={"session_id": session_id, "count": new_count}
            )
            
            return new_count
            
        except ClientError as e:
            logger.error(
                f"Failed to increment clarification count: {str(e)}",
                extra={"session_id": session_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to increment clarification count: {str(e)}") from e
    
    async def delete_session(self, session_id: str) -> None:
        """
        Delete a session.
        
        Args:
            session_id: Session identifier
            
        Raises:
            DynamoDBError: If deletion fails
        """
        try:
            self.table.delete_item(
                Key={
                    'pk': session_id,
                    'sk': f"SESSION#{session_id}"
                }
            )
            
            logger.info(f"Session deleted", extra={"session_id": session_id})
            
        except ClientError as e:
            logger.error(
                f"Failed to delete session: {str(e)}",
                extra={"session_id": session_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to delete session: {str(e)}") from e
    
    async def get_user_sessions(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[SessionState]:
        """
        Get all sessions for a user.
        
        Args:
            user_id: User identifier
            limit: Maximum number of sessions to return
            
        Returns:
            List[SessionState]: List of user sessions
            
        Raises:
            DynamoDBError: If query fails
        """
        try:
            # Use GSI if exists, otherwise scan (not recommended for production)
            response = self.table.scan(
                FilterExpression="user_id = :user_id",
                ExpressionAttributeValues={':user_id': user_id},
                Limit=limit
            )
            
            sessions = []
            for item in response.get('Items', []):
                session = await self.get_session(item['pk'])
                if session:
                    sessions.append(session)
            
            logger.debug(
                f"Retrieved user sessions",
                extra={"user_id": user_id, "count": len(sessions)}
            )
            
            return sessions
            
        except ClientError as e:
            logger.error(
                f"Failed to get user sessions: {str(e)}",
                extra={"user_id": user_id},
                exc_info=True
            )
            raise DynamoDBError(f"Failed to get user sessions: {str(e)}") from e


# Global repository instance
session_repo = SessionRepository()






