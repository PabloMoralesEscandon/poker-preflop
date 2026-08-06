# Poker Learner backend

The backend is a Python 3.12+ FastAPI service managed with `uv`.

```bash
uv sync
uv run uvicorn learner.main:app --reload
uv run pytest
uv run ruff check
uv run ruff format --check
```

The API is served under `/api/v1`; its health check is available at
`http://127.0.0.1:8000/api/v1/health`.

