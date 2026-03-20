# Ollama setup for TalknShop image handling

The **media-service** uses Ollama for vision-based image analysis (e.g. describing clothing or products in photos). This guide gets Ollama installed and reachable by the service.

---

## 1. Install Ollama on your machine

**macOS (your setup):**

1. Go to [ollama.com](https://ollama.com) and download the Mac app, or install via Homebrew:
   ```bash
   brew install ollama
   ```
2. Start Ollama:
   - **App:** Open the Ollama app from Applications (it runs in the menu bar).
   - **CLI:** Run `ollama serve` in a terminal (or use the app so it stays running in the background).

Ollama listens on **http://localhost:11434** by default.

---

## 2. Pull the vision model

The project expects a vision-capable model (default: **llava:7b**). In a terminal:

```bash
ollama pull llava:7b
```

This can take a few minutes. When it finishes, you can confirm:

```bash
ollama list
```

You should see `llava:7b` (or similar) in the list.

---

## 3. Configure media-service to use Ollama

**If you run media-service locally** (not in Docker):

- No change needed if Ollama is on the same machine. Defaults are:
  - `OLLAMA_HOST=http://localhost:11434`
  - `OLLAMA_MODEL=llava:7b`
- If your `.env` already overrides these, ensure they point to your running Ollama and the model you pulled.

**If you run media-service in Docker** (e.g. `docker-compose up`):

- The container cannot use `localhost:11434`; it must use the **host** where Ollama runs.
- In `apps/media-service/.env` set:
  - **Mac/Windows (Docker Desktop):**  
    `OLLAMA_HOST=http://host.docker.internal:11434`
  - **Linux:**  
    Use your host IP, e.g. `OLLAMA_HOST=http://172.17.0.1:11434`
  - **Model:**  
    `OLLAMA_MODEL=llava:7b` (or the model you pulled)

Then restart the stack so media-service picks up the env:

```bash
docker-compose up -d --build media-service
```

---

## 4. Verify Ollama is reachable

With media-service running (locally or in Docker):

```bash
curl -s http://localhost:8001/api/v1/ollama/status
```

Expected when everything is OK:

- `"available": true`
- `"configured_model": "llava:7b"`
- `"ollama_host": "http://..."` (matches your config)
- `"models": ["llava:7b", ...]`
- `"error": null`

If `"available": false`, check the `"error"` field:

- **Connection refused** → Ollama not running, or wrong `OLLAMA_HOST` (e.g. from Docker use `host.docker.internal`, not `localhost`).
- **Model missing** → Run `ollama pull llava:7b` on the host.

---

## 5. Optional: use a different vision model

You can use another Ollama vision model (e.g. `llava:13b`, `llava:34b`, or newer LLaVA variants). Pull it and set in `.env`:

```bash
ollama pull llava:13b
```

Then in `apps/media-service/.env`:

```
OLLAMA_MODEL=llava:13b
```

Restart media-service after changing `.env`.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Install Ollama (app or `brew install ollama`) and start it. |
| 2 | Run `ollama pull llava:7b`. |
| 3 | In Docker: set `OLLAMA_HOST=http://host.docker.internal:11434` in `apps/media-service/.env`. |
| 4 | Restart media-service; call `GET http://localhost:8001/api/v1/ollama/status` to confirm. |

If Ollama is unavailable, media-service still runs and uses **AWS Rekognition only** for image extraction; vision-enhanced descriptions (e.g. “bomber jacket”) will be skipped.
