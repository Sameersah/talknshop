from fastapi import FastAPI

app = FastAPI(title="talknshop-catalog")

@app.get("/health")
def health():
    return {"status": "ok"}
