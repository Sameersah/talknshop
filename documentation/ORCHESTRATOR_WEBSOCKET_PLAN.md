# Orchestrator Service Implementation Plan (WebSocket-Based)

## Architecture Overview

The orchestrator will coordinate the buyer flow through a **LangGraph state machine** with 10 nodes, persisting state to **DynamoDB**, using **AWS Bedrock (Claude 3 Sonnet)** for agent decisions, and orchestrating calls to **media-service** and **catalog-service**.

### Communication Protocol: WebSocket

**WebSocket** enables real-time conversational chat experience with the iOS app:
- ✅ Persistent connection for multi-turn conversations
- ✅ Token-by-token streaming of LLM responses (like ChatGPT)
- ✅ Real-time progress updates through workflow nodes
- ✅ Seamless clarification loops without reconnection
- ✅ Natural chat UX matching iOS messaging apps

### Architecture Flow
```
iOS App (URLSessionWebSocketTask)
  ↓
API Gateway (WebSocket API + Cognito JWT)
  ↓
VPC Link
  ↓
ALB (with sticky sessions for WebSocket)
  ↓
ECS/Fargate (orchestrator with WebSocket support)
  ↓
LangGraph (astream_events for streaming)
  ↓
AWS Bedrock (Claude 3 with streaming)
```

## Core Components to Implement

### 1. Project Structure & Dependencies

Create modular structure in `apps/orchestrator-service/`:
```
app/
  ├── core/           # Config, logging, AWS clients
  ├── models/         # Pydantic models (RequirementSpec, Session, etc.)
  ├── services/       # External service clients (media, catalog)
  ├── graph/          # LangGraph nodes and state machine
  ├── websocket/      # WebSocket connection management ⭐ NEW
  │   ├── manager.py  # Connection manager
  │   ├── events.py   # Event types & serialization
  │   └── handler.py  # WebSocket message handler
  ├── api/            # FastAPI routes (health check, session management)
  └── db/             # DynamoDB operations
```

**Key Dependencies** (add to `requirements.txt`):
- `fastapi==0.115.0` - Web framework with WebSocket support
- `uvicorn[standard]==0.30.6` - ASGI server with WebSocket
- `websockets==12.0` - WebSocket protocol implementation
- `langgraph==0.2.28` - State machine framework
- `langchain==0.3.0` - LLM orchestration
- `langchain-aws==0.2.0` - Bedrock integration
- `httpx==0.27.0` - Async HTTP client for service calls
- `pydantic-settings==2.5.0` - Settings management
- `boto3==1.35.20` - AWS SDK
- `python-dotenv==1.0.1` - Environment management

### 2. Configuration & AWS Setup

**File**: `app/core/config.py`
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # AWS Configuration
    aws_region: str = "us-west-2"
    dynamodb_table_name: str = "orchestrator-requests"
    bedrock_model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"
    
    # Service URLs
    media_service_url: str = "http://media-service:8001"
    catalog_service_url: str = "http://catalog-service:8002"
    
    # WebSocket Settings
    ws_heartbeat_interval: int = 30  # seconds
    ws_message_timeout: int = 300     # 5 minutes max per message
    max_concurrent_connections: int = 1000
    
    # Application
    log_level: str = "INFO"
    debug: bool = False
    
    class Config:
        env_file = ".env"
```

**File**: `app/core/aws_clients.py`
```python
import boto3
from functools import lru_cache

@lru_cache()
def get_bedrock_client():
    """Singleton Bedrock runtime client"""
    return boto3.client('bedrock-runtime', region_name=settings.aws_region)

@lru_cache()
def get_dynamodb_resource():
    """Singleton DynamoDB resource"""
    return boto3.resource('dynamodb', region_name=settings.aws_region)
```

### 3. WebSocket Connection Management ⭐ NEW

**File**: `app/websocket/manager.py`
```python
from fastapi import WebSocket
from typing import Dict, Set
import asyncio
import json
from datetime import datetime

class ConnectionManager:
    """Manages active WebSocket connections"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.connection_metadata: Dict[str, dict] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str, user_id: str):
        """Accept and register new connection"""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.connection_metadata[session_id] = {
            "user_id": user_id,
            "connected_at": datetime.utcnow(),
            "last_heartbeat": datetime.utcnow()
        }
    
    def disconnect(self, session_id: str):
        """Remove connection"""
        self.active_connections.pop(session_id, None)
        self.connection_metadata.pop(session_id, None)
    
    async def send_event(self, session_id: str, event_type: str, data: dict):
        """Send event to specific connection"""
        if session_id in self.active_connections:
            websocket = self.active_connections[session_id]
            message = {
                "type": event_type,
                "data": data,
                "timestamp": datetime.utcnow().isoformat()
            }
            await websocket.send_json(message)
    
    async def heartbeat_loop(self, session_id: str):
        """Send periodic pings to keep connection alive"""
        while session_id in self.active_connections:
            await asyncio.sleep(30)
            if session_id in self.active_connections:
                await self.send_event(session_id, "ping", {})

manager = ConnectionManager()
```

**File**: `app/websocket/events.py`
```python
from enum import Enum
from pydantic import BaseModel
from typing import Optional, Dict, Any

class EventType(str, Enum):
    """WebSocket event types"""
    # From server to client
    CONNECTED = "connected"
    PROGRESS = "progress"
    THINKING = "thinking"
    TOKEN = "token"              # LLM token streaming
    CLARIFICATION = "clarification"
    RESULTS = "results"
    ERROR = "error"
    DONE = "done"
    PING = "ping"
    
    # From client to server
    MESSAGE = "message"
    ANSWER = "answer"            # Answer to clarification
    PONG = "pong"

class ClientMessage(BaseModel):
    """Message from client"""
    type: EventType
    message: Optional[str] = None
    media: Optional[list[str]] = None  # S3 keys for media files
    session_id: Optional[str] = None

class ServerEvent(BaseModel):
    """Event from server"""
    type: EventType
    data: Dict[str, Any]
    timestamp: str
```

**File**: `app/websocket/handler.py`
```python
from fastapi import WebSocket, WebSocketDisconnect
from app.websocket.manager import manager
from app.websocket.events import EventType, ClientMessage
from app.graph.graph import compiled_graph
from app.db.dynamodb import get_session, update_session
import json

async def handle_websocket(websocket: WebSocket, session_id: str, user_id: str):
    """Main WebSocket handler"""
    await manager.connect(websocket, session_id, user_id)
    
    # Send connection confirmation
    await manager.send_event(session_id, EventType.CONNECTED, {
        "session_id": session_id,
        "message": "Connected to TalknShop orchestrator"
    })
    
    # Start heartbeat
    import asyncio
    heartbeat_task = asyncio.create_task(manager.heartbeat_loop(session_id))
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            client_msg = ClientMessage(**data)
            
            if client_msg.type == EventType.PONG:
                # Update last heartbeat
                manager.connection_metadata[session_id]["last_heartbeat"] = datetime.utcnow()
                continue
            
            # Process user message through LangGraph
            if client_msg.type in [EventType.MESSAGE, EventType.ANSWER]:
                await process_message(session_id, user_id, client_msg)
    
    except WebSocketDisconnect:
        manager.disconnect(session_id)
        heartbeat_task.cancel()
        # Persist session state
        await persist_session_on_disconnect(session_id)
    except Exception as e:
        await manager.send_event(session_id, EventType.ERROR, {
            "error": str(e),
            "message": "An error occurred"
        })
        manager.disconnect(session_id)
        heartbeat_task.cancel()

async def process_message(session_id: str, user_id: str, client_msg: ClientMessage):
    """Process user message through LangGraph with streaming"""
    
    # Send thinking indicator
    await manager.send_event(session_id, EventType.THINKING, {
        "message": "Processing your request..."
    })
    
    # Stream LangGraph execution
    async for event in compiled_graph.astream_events(
        {
            "message": client_msg.message,
            "media": client_msg.media or [],
            "session_id": session_id,
            "user_id": user_id
        },
        config={"configurable": {"thread_id": session_id}},
        version="v1"
    ):
        # Send progress updates for each node
        if event["event"] == "on_chain_start":
            node_name = event["name"]
            await manager.send_event(session_id, EventType.PROGRESS, {
                "step": node_name,
                "message": f"Executing: {node_name}"
            })
        
        # Stream LLM tokens (for clarifying questions)
        elif event["event"] == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if hasattr(chunk, "content"):
                await manager.send_event(session_id, EventType.TOKEN, {
                    "content": chunk.content
                })
        
        # Handle specific node completions
        elif event["event"] == "on_chain_end":
            node_name = event["name"]
            output = event["data"]["output"]
            
            # Clarification needed
            if node_name == "AskClarifyingQ":
                await manager.send_event(session_id, EventType.CLARIFICATION, {
                    "question": output.get("question"),
                    "context": output.get("context")
                })
                # Graph pauses here, waiting for user response
            
            # Search results ready
            elif node_name == "SearchMarketplaces":
                await manager.send_event(session_id, EventType.PROGRESS, {
                    "step": "search_complete",
                    "message": f"Found {len(output.get('products', []))} products"
                })
            
            # Final results
            elif node_name == "Done":
                await manager.send_event(session_id, EventType.RESULTS, {
                    "products": output.get("products", []),
                    "requirement_spec": output.get("requirement_spec"),
                    "metadata": output.get("metadata")
                })
                await manager.send_event(session_id, EventType.DONE, {
                    "message": "Search completed"
                })
```

### 4. Data Models

**File**: `app/models/schemas.py`
```python
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class WorkflowStage(str, Enum):
    INITIAL = "initial"
    MEDIA_PROCESSING = "media_processing"
    REQUIREMENT_BUILDING = "requirement_building"
    CLARIFICATION = "clarification"
    SEARCHING = "searching"
    RANKING = "ranking"
    COMPLETED = "completed"
    FAILED = "failed"

class RequirementSpec(BaseModel):
    """Structured product search requirements"""
    product_type: str
    attributes: Dict[str, Any] = Field(default_factory=dict)
    filters: Dict[str, Any] = Field(default_factory=dict)
    # Example filters: {"price": {"max": 1200}, "rating_min": 4.2, "brand": ["Apple", "Dell"]}

class SessionState(BaseModel):
    """Conversation session state"""
    session_id: str
    user_id: str
    workflow_stage: WorkflowStage
    requirement_spec: Optional[RequirementSpec] = None
    clarification_count: int = 0
    created_at: datetime
    updated_at: datetime

class TurnInput(BaseModel):
    """Single user turn input"""
    message: str
    media: List[str] = Field(default_factory=list)  # S3 keys

class WorkflowState(TypedDict):
    """LangGraph state object"""
    session_id: str
    user_id: str
    message: str
    media: List[str]
    transcript: Optional[str]
    image_attributes: Optional[Dict]
    requirement_spec: Optional[RequirementSpec]
    needs_clarification: bool
    clarification_question: Optional[str]
    clarification_count: int
    search_results: Optional[List[Dict]]
    final_results: Optional[List[Dict]]
    workflow_stage: WorkflowStage
```

### 5. FastAPI WebSocket Endpoint

**File**: `app/api/websocket_routes.py`
```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.websocket.handler import handle_websocket
from app.core.config import settings
import uuid

router = APIRouter()

@router.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time chat
    
    Client connects and receives session_id, then starts conversing
    """
    # Generate new session or accept existing from query params
    session_id = websocket.query_params.get("session_id", str(uuid.uuid4()))
    user_id = websocket.query_params.get("user_id", "anonymous")
    
    # TODO: Add authentication - validate JWT from query params
    # user_id = await authenticate_websocket(websocket)
    
    await handle_websocket(websocket, session_id, user_id)

@router.websocket("/ws/chat/{session_id}")
async def websocket_chat_resume(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint to resume existing session
    """
    user_id = websocket.query_params.get("user_id", "anonymous")
    
    # TODO: Validate user owns this session
    
    await handle_websocket(websocket, session_id, user_id)
```

**File**: `app/api/http_routes.py`
```python
from fastapi import APIRouter, HTTPException
from app.db.dynamodb import get_session
from app.models.schemas import SessionState

router = APIRouter()

@router.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

@router.get("/api/v1/sessions/{session_id}")
async def get_session_state(session_id: str) -> SessionState:
    """Get current session state (for debugging/reconnection)"""
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
```

### 6. Main Application

**File**: `app/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import websocket_routes, http_routes
from app.core.config import settings
import logging

# Configure logging
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TalknShop Orchestrator",
    description="Real-time conversational product search orchestrator",
    version="1.0.0"
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(websocket_routes.router, tags=["websocket"])
app.include_router(http_routes.router, tags=["http"])

@app.on_event("startup")
async def startup_event():
    logger.info("Starting TalknShop Orchestrator")
    logger.info(f"DynamoDB table: {settings.dynamodb_table_name}")
    logger.info(f"Bedrock model: {settings.bedrock_model_id}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down TalknShop Orchestrator")
```

### 7. LangGraph Implementation

(Same as original plan - nodes remain unchanged, but now stream events to WebSocket)

**File**: `app/graph/nodes.py` - Implement 10 nodes as specified in original plan

**File**: `app/graph/graph.py`
```python
from langgraph.graph import StateGraph, END
from app.graph.state import WorkflowState
from app.graph import nodes
from langgraph.checkpoint.dynamodb import DynamoDBSaver
from app.core.aws_clients import get_dynamodb_resource

# Create graph
workflow = StateGraph(WorkflowState)

# Add nodes
workflow.add_node("parse_input", nodes.parse_input)
workflow.add_node("need_media_ops", nodes.need_media_ops)
workflow.add_node("transcribe_audio", nodes.transcribe_audio)
workflow.add_node("extract_image_attrs", nodes.extract_image_attrs)
workflow.add_node("build_requirement_spec", nodes.build_requirement_spec)
workflow.add_node("need_clarify", nodes.need_clarify)
workflow.add_node("ask_clarifying_q", nodes.ask_clarifying_q)
workflow.add_node("search_marketplaces", nodes.search_marketplaces)
workflow.add_node("rank_and_compose", nodes.rank_and_compose)
workflow.add_node("done", nodes.done)

# Define edges
workflow.set_entry_point("parse_input")
workflow.add_edge("parse_input", "need_media_ops")

# Conditional edges for media processing
workflow.add_conditional_edges(
    "need_media_ops",
    nodes.route_media_ops,
    {
        "transcribe": "transcribe_audio",
        "extract_image": "extract_image_attrs",
        "both": "transcribe_audio",
        "skip": "build_requirement_spec"
    }
)

workflow.add_edge("transcribe_audio", "build_requirement_spec")
workflow.add_edge("extract_image_attrs", "build_requirement_spec")
workflow.add_edge("build_requirement_spec", "need_clarify")

# Conditional for clarification
workflow.add_conditional_edges(
    "need_clarify",
    nodes.route_clarification,
    {
        "clarify": "ask_clarifying_q",
        "search": "search_marketplaces"
    }
)

# Clarification loop - graph interrupts here, waits for user response
workflow.add_edge("ask_clarifying_q", END)  # Pauses workflow

workflow.add_edge("search_marketplaces", "rank_and_compose")
workflow.add_edge("rank_and_compose", "done")
workflow.add_edge("done", END)

# Compile with DynamoDB checkpointer for state persistence
dynamodb = get_dynamodb_resource()
checkpointer = DynamoDBSaver(dynamodb.Table("orchestrator-checkpoints"))

compiled_graph = workflow.compile(checkpointer=checkpointer)
```

### 8. AWS Infrastructure (CDK)

**File**: `infrastructure/cdk/stacks/orchestrator_stack.py`
```python
import aws_cdk as cdk
from aws_cdk import (
    aws_dynamodb as dynamodb,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_elasticloadbalancingv2 as elbv2,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations as integrations,
    aws_logs as logs,
    aws_iam as iam,
    aws_ecr as ecr,
)
from constructs import Construct

class OrchestratorStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # 1. DynamoDB Tables
        sessions_table = dynamodb.Table(
            self, "OrchestratorRequestsTable",
            partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=cdk.RemovalPolicy.DESTROY
        )
        
        checkpoints_table = dynamodb.Table(
            self, "OrchestratorCheckpointsTable",
            partition_key=dynamodb.Attribute(name="thread_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="checkpoint_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=cdk.RemovalPolicy.DESTROY
        )
        
        # 2. VPC
        vpc = ec2.Vpc(
            self, "OrchestratorVPC",
            max_azs=2,
            nat_gateways=1
        )
        
        # 3. ECS Cluster
        cluster = ecs.Cluster(
            self, "OrchestratorCluster",
            vpc=vpc,
            container_insights=True
        )
        
        # 4. ECR Repository
        ecr_repo = ecr.Repository(
            self, "OrchestratorRepo",
            repository_name="talknshop-orchestrator",
            removal_policy=cdk.RemovalPolicy.DESTROY
        )
        
        # 5. Task Definition
        task_definition = ecs.FargateTaskDefinition(
            self, "OrchestratorTask",
            cpu=2048,
            memory_limit_mib=4096
        )
        
        # Add Bedrock permissions
        task_definition.add_to_task_role_policy(
            iam.PolicyStatement(
                actions=["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
                resources=["*"]
            )
        )
        
        # Add DynamoDB permissions
        sessions_table.grant_read_write_data(task_definition.task_role)
        checkpoints_table.grant_read_write_data(task_definition.task_role)
        
        # Container
        container = task_definition.add_container(
            "OrchestratorContainer",
            image=ecs.ContainerImage.from_ecr_repository(ecr_repo, "latest"),
            logging=ecs.LogDriver.aws_logs(
                stream_prefix="orchestrator",
                log_retention=logs.RetentionDays.ONE_WEEK
            ),
            environment={
                "AWS_REGION": self.region,
                "DYNAMODB_TABLE_NAME": sessions_table.table_name,
                "CHECKPOINT_TABLE_NAME": checkpoints_table.table_name,
                "BEDROCK_MODEL_ID": "anthropic.claude-3-sonnet-20240229-v1:0",
                "LOG_LEVEL": "INFO"
            }
        )
        
        container.add_port_mappings(
            ecs.PortMapping(container_port=8000, protocol=ecs.Protocol.TCP)
        )
        
        # 6. ALB with sticky sessions for WebSocket
        alb = elbv2.ApplicationLoadBalancer(
            self, "OrchestratorALB",
            vpc=vpc,
            internet_facing=True
        )
        
        target_group = elbv2.ApplicationTargetGroup(
            self, "OrchestratorTargetGroup",
            vpc=vpc,
            port=8000,
            protocol=elbv2.ApplicationProtocol.HTTP,
            target_type=elbv2.TargetType.IP,
            health_check=elbv2.HealthCheck(
                path="/health",
                interval=cdk.Duration.seconds(30)
            ),
            # Enable sticky sessions for WebSocket
            stickiness_cookie_duration=cdk.Duration.hours(1)
        )
        
        listener = alb.add_listener(
            "OrchestratorListener",
            port=80,
            default_target_groups=[target_group]
        )
        
        # 7. ECS Service
        service = ecs.FargateService(
            self, "OrchestratorService",
            cluster=cluster,
            task_definition=task_definition,
            desired_count=2,
            min_healthy_percent=50,
            max_healthy_percent=200,
            enable_execute_command=True
        )
        
        # Attach to target group
        service.attach_to_application_target_group(target_group)
        
        # Auto-scaling
        scaling = service.auto_scale_task_count(max_capacity=10)
        scaling.scale_on_cpu_utilization(
            "CpuScaling",
            target_utilization_percent=70
        )
        
        # 8. WebSocket API Gateway
        websocket_api = apigwv2.WebSocketApi(
            self, "OrchestratorWebSocketAPI",
            route_selection_expression="$request.body.action"
        )
        
        # VPC Link for private integration
        vpc_link = apigwv2.VpcLink(
            self, "WebSocketVpcLink",
            vpc=vpc
        )
        
        # WebSocket integration to ALB
        integration = integrations.WebSocketAwsIntegration(
            "ALBIntegration",
            integration_uri=f"http://{alb.load_balancer_dns_name}"
        )
        
        websocket_api.add_route(
            "$connect",
            integration=integration
        )
        
        websocket_api.add_route(
            "$disconnect",
            integration=integration
        )
        
        websocket_api.add_route(
            "$default",
            integration=integration
        )
        
        # Deploy WebSocket API
        stage = apigwv2.WebSocketStage(
            self, "ProductionStage",
            web_socket_api=websocket_api,
            stage_name="prod",
            auto_deploy=True
        )
        
        # Outputs
        cdk.CfnOutput(self, "WebSocketURL",
            value=stage.url,
            description="WebSocket API URL"
        )
        cdk.CfnOutput(self, "LoadBalancerDNS",
            value=alb.load_balancer_dns_name,
            description="ALB DNS Name"
        )
        cdk.CfnOutput(self, "ECRRepository",
            value=ecr_repo.repository_uri,
            description="ECR Repository URI"
        )
```

## Implementation Order

1. **Setup** (config, AWS clients, models, websocket manager)
2. **WebSocket infrastructure** (manager, events, basic handler)
3. **DynamoDB** layer (sessions and checkpoints)
4. **Service clients** (media, catalog) with mocks
5. **Simple nodes** (ParseInput, Done)
6. **Agent nodes** (NeedMediaOps, BuildOrUpdateRequirementSpec, NeedClarify, AskClarifyingQ)
7. **Service nodes** (TranscribeAudio, ExtractImageAttrs, SearchMarketplaces, RankAndCompose)
8. **LangGraph** assembly with streaming
9. **WebSocket handler** with LangGraph integration
10. **FastAPI** application assembly
11. **CDK Infrastructure** deployment
12. **Testing** (WebSocket clients, full flow)

## Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-west-2
DYNAMODB_TABLE_NAME=orchestrator-requests
CHECKPOINT_TABLE_NAME=orchestrator-checkpoints
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Service URLs
MEDIA_SERVICE_URL=http://media-service:8001
CATALOG_SERVICE_URL=http://catalog-service:8002

# WebSocket Settings
WS_HEARTBEAT_INTERVAL=30
WS_MESSAGE_TIMEOUT=300
MAX_CONCURRENT_CONNECTIONS=1000

# Application
LOG_LEVEL=INFO
DEBUG=false
```

## iOS Client Integration Example

```swift
import Foundation

class ChatService: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var isConnected = false
    
    private var webSocketTask: URLSessionWebSocketTask?
    private let sessionId: String
    
    init(sessionId: String? = nil) {
        self.sessionId = sessionId ?? UUID().uuidString
    }
    
    func connect() {
        let url = URL(string: "wss://api.talknshop.com/ws/chat?session_id=\(sessionId)&user_id=\(userId)")!
        webSocketTask = URLSession.shared.webSocketTask(with: url)
        webSocketTask?.resume()
        isConnected = true
        receiveMessage()
    }
    
    func sendMessage(_ text: String, media: [String] = []) {
        let message: [String: Any] = [
            "type": "message",
            "message": text,
            "media": media
        ]
        
        let data = try! JSONSerialization.data(withJSONObject: message)
        let string = String(data: data, encoding: .utf8)!
        
        webSocketTask?.send(.string(string)) { error in
            if let error = error {
                print("Send error: \(error)")
            }
        }
    }
    
    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.handleServerEvent(text)
                default:
                    break
                }
                self?.receiveMessage() // Continue listening
                
            case .failure(let error):
                print("Receive error: \(error)")
                self?.isConnected = false
            }
        }
    }
    
    private func handleServerEvent(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String,
              let eventData = json["data"] as? [String: Any] else {
            return
        }
        
        DispatchQueue.main.async {
            switch type {
            case "connected":
                print("Connected to orchestrator")
                
            case "progress":
                // Show loading indicator with step
                self.showProgress(step: eventData["step"] as? String)
                
            case "token":
                // Append token to current streaming message
                self.appendToken(eventData["content"] as? String ?? "")
                
            case "clarification":
                // Show clarifying question
                let question = eventData["question"] as? String ?? ""
                self.addMessage(text: question, from: .assistant)
                
            case "results":
                // Show product results
                if let products = eventData["products"] as? [[String: Any]] {
                    self.showResults(products)
                }
                
            case "done":
                self.hideProgress()
                
            case "ping":
                // Respond to ping
                self.sendPong()
                
            default:
                break
            }
        }
    }
    
    private func sendPong() {
        let pong = ["type": "pong"]
        let data = try! JSONSerialization.data(withJSONObject: pong)
        let string = String(data: data, encoding: .utf8)!
        webSocketTask?.send(.string(string), completionHandler: nil)
    }
}
```

## Testing Strategy

1. **Unit Tests**: Test each LangGraph node independently
2. **WebSocket Tests**: Use `pytest-asyncio` and `websockets` library
3. **Integration Tests**: Full flow with mocked Bedrock/DynamoDB
4. **Load Tests**: Test concurrent WebSocket connections

## Key Deliverables

- [x] WebSocket-based real-time orchestrator
- [x] LangGraph buyer flow with 10 nodes
- [x] AWS Bedrock (Claude 3) integration
- [x] DynamoDB state persistence
- [x] CDK infrastructure for ECS/ALB/API Gateway
- [x] iOS WebSocket client example
- [x] Comprehensive error handling
- [x] Production-ready logging and monitoring

