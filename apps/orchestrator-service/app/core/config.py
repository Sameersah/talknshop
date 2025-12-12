"""
Configuration management for the orchestrator service.

This module provides centralized configuration using Pydantic Settings,
with support for environment variables and .env files.
"""

from functools import lru_cache
from typing import Optional
from pydantic import Field, validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import logging

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application Settings
    app_name: str = "TalknShop Orchestrator"
    app_version: str = "1.0.0"
    debug: bool = Field(default=False, description="Enable debug mode")
    log_level: str = Field(default="INFO", description="Logging level")
    environment: str = Field(default="development", description="Environment (development, staging, production)")
    
    # AWS Configuration
    aws_region: str = Field(default="us-west-2", description="AWS region")
    aws_access_key_id: Optional[str] = Field(default=None, description="AWS access key (optional, use IAM roles in production)")
    aws_secret_access_key: Optional[str] = Field(default=None, description="AWS secret key (optional, use IAM roles in production)")
    
    # DynamoDB
    dynamodb_table_name: str = Field(default="orchestrator-requests", description="DynamoDB sessions table")
    dynamodb_checkpoint_table: str = Field(default="orchestrator-checkpoints", description="DynamoDB checkpoints table for LangGraph")
    
    # AWS Bedrock
    bedrock_model_id: str = Field(
        default="anthropic.claude-3-sonnet-20240229-v1:0",
        description="Bedrock model ID for LLM operations"
    )
    bedrock_streaming: bool = Field(default=True, description="Enable streaming responses from Bedrock")
    bedrock_max_tokens: int = Field(default=2048, description="Max tokens for Bedrock responses")
    bedrock_temperature: float = Field(default=0.7, description="Temperature for LLM generation")
    
    # Service URLs
    media_service_url: str = Field(default="http://media-service:8001", description="Media service base URL")
    catalog_service_url: str = Field(default="http://catalog-service:8002", description="Catalog service base URL")
    use_mock_services: bool = Field(default=False, description="Return mock responses for upstream services")
    
    # WebSocket Settings
    ws_heartbeat_interval: int = Field(default=30, description="WebSocket heartbeat interval in seconds")
    ws_message_timeout: int = Field(default=300, description="WebSocket message processing timeout in seconds")
    ws_max_concurrent_connections: int = Field(default=1000, description="Maximum concurrent WebSocket connections")
    ws_reconnect_attempts: int = Field(default=3, description="Maximum reconnection attempts")
    
    # Service Client Settings
    http_timeout: float = Field(default=30.0, description="HTTP client timeout in seconds")
    http_max_retries: int = Field(default=3, description="Maximum HTTP retry attempts")
    http_retry_backoff: float = Field(default=1.0, description="Retry backoff multiplier")
    
    # Workflow Settings
    max_clarification_loops: int = Field(default=2, description="Maximum clarification loops per session")
    session_ttl_hours: int = Field(default=24, description="Session TTL in hours")
    
    # Performance & Rate Limiting
    max_concurrent_graph_executions: int = Field(default=100, description="Max concurrent LangGraph executions")
    rate_limit_per_user: int = Field(default=10, description="Max requests per user per minute")
    
    # Checkpointing
    use_memory_checkpointer: bool = Field(default=False, description="Use in-memory LangGraph checkpointer (local testing)")
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    @validator("log_level")
    def validate_log_level(cls, v: str) -> str:
        """Validate log level is valid."""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        v_upper = v.upper()
        if v_upper not in valid_levels:
            raise ValueError(f"Invalid log level: {v}. Must be one of {valid_levels}")
        return v_upper
    
    @validator("environment")
    def validate_environment(cls, v: str) -> str:
        """Validate environment is valid."""
        valid_envs = ["development", "staging", "production"]
        v_lower = v.lower()
        if v_lower not in valid_envs:
            raise ValueError(f"Invalid environment: {v}. Must be one of {valid_envs}")
        return v_lower
    
    @validator("bedrock_temperature")
    def validate_temperature(cls, v: float) -> float:
        """Validate temperature is in valid range."""
        if not 0 <= v <= 1:
            raise ValueError(f"Temperature must be between 0 and 1, got {v}")
        return v
    
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment == "production"
    
    def get_bedrock_config(self) -> dict:
        """Get Bedrock model configuration."""
        return {
            "model_id": self.bedrock_model_id,
            "streaming": self.bedrock_streaming,
            "max_tokens": self.bedrock_max_tokens,
            "temperature": self.bedrock_temperature,
        }


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Uses LRU cache to ensure single instance across application.
    
    Returns:
        Settings: Application settings instance
    """
    logger.info("Loading application settings")
    settings = Settings()
    logger.info(f"Settings loaded: environment={settings.environment}, region={settings.aws_region}")
    return settings


# Global settings instance
settings = get_settings()






