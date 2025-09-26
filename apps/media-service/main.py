from fastapi import FastAPI

app = FastAPI(title="talknshop-media")

@app.get("/health")
def health():
    return {"status": "ok"}
