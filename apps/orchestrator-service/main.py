from fastapi import FastAPI

app = FastAPI(title="talknshop-orchestrator")

@app.get("/health")
def health():
    return {"status": "ok"}
