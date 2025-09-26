#!/usr/bin/env bash
set -euo pipefail
python3 -m venv .venv && source .venv/bin/activate && pip install -r apps/orchestrator-service/requirements.txt
