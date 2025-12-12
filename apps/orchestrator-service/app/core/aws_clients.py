"""
AWS client singletons for the orchestrator service.

Provides thread-safe singleton instances of AWS clients with
proper configuration and error handling.
"""

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config
from botocore.exceptions import ClientError, BotoCoreError
from functools import lru_cache
from typing import Optional
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class AWSClientError(Exception):
    """Base exception for AWS client errors."""
    pass


class BedrockClientError(AWSClientError):
    """Exception for Bedrock client errors."""
    pass


class DynamoDBClientError(AWSClientError):
    """Exception for DynamoDB client errors."""
    pass


@lru_cache()
def get_boto3_config() -> Config:
    """
    Get Boto3 configuration with retry and timeout settings.
    
    Returns:
        Config: Boto3 configuration object
    """
    return Config(
        region_name=settings.aws_region,
        retries={
            'max_attempts': settings.http_max_retries,
            'mode': 'adaptive'  # Adaptive retry mode for better handling
        },
        connect_timeout=10,
        read_timeout=60,
        max_pool_connections=50
    )


@lru_cache()
def get_bedrock_client():
    """
    Get singleton Bedrock Runtime client.
    
    Returns:
        boto3.client: Bedrock Runtime client
        
    Raises:
        BedrockClientError: If client initialization fails
    """
    try:
        logger.info(f"Initializing Bedrock client for region {settings.aws_region}")
        
        client_kwargs = {
            'service_name': 'bedrock-runtime',
            'config': get_boto3_config()
        }
        
        # Add credentials if provided (for local development)
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            client_kwargs['aws_access_key_id'] = settings.aws_access_key_id
            client_kwargs['aws_secret_access_key'] = settings.aws_secret_access_key
            logger.debug("Using provided AWS credentials")
        else:
            logger.debug("Using IAM role credentials")
        
        client = boto3.client(**client_kwargs)
        
        logger.info("Bedrock client initialized successfully")
        return client
        
    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to initialize Bedrock client: {str(e)}", exc_info=True)
        raise BedrockClientError(f"Failed to initialize Bedrock client: {str(e)}") from e
    except Exception as e:
        logger.error(f"Unexpected error initializing Bedrock client: {str(e)}", exc_info=True)
        raise BedrockClientError(f"Unexpected error: {str(e)}") from e


@lru_cache()
def get_dynamodb_resource():
    """
    Get singleton DynamoDB resource.
    
    Returns:
        boto3.resource: DynamoDB resource
        
    Raises:
        DynamoDBClientError: If resource initialization fails
    """
    try:
        logger.info(f"Initializing DynamoDB resource for region {settings.aws_region}")
        
        resource_kwargs = {
            'service_name': 'dynamodb',
            'config': get_boto3_config()
        }
        
        # Add credentials if provided (for local development)
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            resource_kwargs['aws_access_key_id'] = settings.aws_access_key_id
            resource_kwargs['aws_secret_access_key'] = settings.aws_secret_access_key
            logger.debug("Using provided AWS credentials")
        else:
            logger.debug("Using IAM role credentials")
        
        resource = boto3.resource(**resource_kwargs)
        
        logger.info("DynamoDB resource initialized successfully")
        return resource
        
    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to initialize DynamoDB resource: {str(e)}", exc_info=True)
        raise DynamoDBClientError(f"Failed to initialize DynamoDB resource: {str(e)}") from e
    except Exception as e:
        logger.error(f"Unexpected error initializing DynamoDB resource: {str(e)}", exc_info=True)
        raise DynamoDBClientError(f"Unexpected error: {str(e)}") from e


@lru_cache()
def get_dynamodb_client():
    """
    Get singleton DynamoDB client (for low-level operations).
    
    Returns:
        boto3.client: DynamoDB client
        
    Raises:
        DynamoDBClientError: If client initialization fails
    """
    try:
        logger.info(f"Initializing DynamoDB client for region {settings.aws_region}")
        
        client_kwargs = {
            'service_name': 'dynamodb',
            'config': get_boto3_config()
        }
        
        # Add credentials if provided (for local development)
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            client_kwargs['aws_access_key_id'] = settings.aws_access_key_id
            client_kwargs['aws_secret_access_key'] = settings.aws_secret_access_key
        
        client = boto3.client(**client_kwargs)
        
        logger.info("DynamoDB client initialized successfully")
        return client
        
    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to initialize DynamoDB client: {str(e)}", exc_info=True)
        raise DynamoDBClientError(f"Failed to initialize DynamoDB client: {str(e)}") from e
    except Exception as e:
        logger.error(f"Unexpected error initializing DynamoDB client: {str(e)}", exc_info=True)
        raise DynamoDBClientError(f"Unexpected error: {str(e)}") from e


def get_sessions_table():
    """
    Get DynamoDB sessions table.
    
    Returns:
        Table: DynamoDB table resource
        
    Raises:
        DynamoDBClientError: If table access fails
    """
    try:
        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.dynamodb_table_name)
        logger.debug(f"Accessed sessions table: {settings.dynamodb_table_name}")
        return table
    except Exception as e:
        logger.error(f"Failed to access sessions table: {str(e)}", exc_info=True)
        raise DynamoDBClientError(f"Failed to access sessions table: {str(e)}") from e


def get_checkpoints_table():
    """
    Get DynamoDB checkpoints table for LangGraph.
    
    Returns:
        Table: DynamoDB table resource
        
    Raises:
        DynamoDBClientError: If table access fails
    """
    try:
        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.dynamodb_checkpoint_table)
        logger.debug(f"Accessed checkpoints table: {settings.dynamodb_checkpoint_table}")
        return table
    except Exception as e:
        logger.error(f"Failed to access checkpoints table: {str(e)}", exc_info=True)
        raise DynamoDBClientError(f"Failed to access checkpoints table: {str(e)}") from e


async def verify_aws_connectivity() -> dict:
    """
    Verify connectivity to AWS services.
    
    Returns:
        dict: Status of each service
    """
    status = {
        "bedrock": False,
        "dynamodb": False,
        "sessions_table": False,
        "checkpoints_table": False
    }
    
    # Test Bedrock
    try:
        client = get_bedrock_client()
        status["bedrock"] = True
        logger.info("Bedrock connectivity verified")
    except Exception as e:
        logger.error(f"Bedrock connectivity failed: {str(e)}")
    
    # Test DynamoDB
    try:
        resource = get_dynamodb_resource()
        status["dynamodb"] = True
        logger.info("DynamoDB connectivity verified")
    except Exception as e:
        logger.error(f"DynamoDB connectivity failed: {str(e)}")
    
    # Test Sessions Table
    try:
        table = get_sessions_table()
        # Try to describe table
        table.load()
        status["sessions_table"] = True
        logger.info(f"Sessions table accessible: {settings.dynamodb_table_name}")
    except Exception as e:
        logger.error(f"Sessions table access failed: {str(e)}")
    
    # Test Checkpoints Table
    try:
        table = get_checkpoints_table()
        table.load()
        status["checkpoints_table"] = True
        logger.info(f"Checkpoints table accessible: {settings.dynamodb_checkpoint_table}")
    except Exception as e:
        logger.error(f"Checkpoints table access failed: {str(e)}")
    
    return status






