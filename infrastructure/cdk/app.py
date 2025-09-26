#!/usr/bin/env python3
import aws_cdk as cdk
from stacks.orchestrator_stack import OrchestratorStack

app = cdk.App()
OrchestratorStack(app, "TalknShop-Orchestrator")
app.synth()
