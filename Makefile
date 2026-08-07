# Root task runner. No Docker, by design — everything here runs the two
# services the way you would run them by hand.
SHELL := /bin/bash

.DEFAULT_GOAL := help
.PHONY: help install dev backend frontend frontend-mock check check-backend check-frontend

help: ## Show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install both sides' dependencies
	cd backend && uv sync
	cd frontend && npm install

dev: ## Run backend and frontend together (Ctrl-C stops both)
	@echo "backend  http://localhost:8000/api/v1"
	@echo "frontend http://localhost:5173"
	@trap 'kill 0' EXIT INT TERM; \
	( cd backend && uv run uvicorn learner.main:app --reload --port 8000 ) & \
	( cd frontend && npm run dev ) & \
	wait

backend: ## Run only the backend
	cd backend && uv run uvicorn learner.main:app --reload --port 8000

frontend: ## Run only the frontend (expects a backend on :8000)
	cd frontend && npm run dev

frontend-mock: ## Run only the frontend, against fixtures, no backend
	cd frontend && VITE_API_MODE=mock npm run dev

check: check-backend check-frontend ## Run every check on both sides

check-backend: ## ruff + pytest
	cd backend && uv run ruff check && uv run ruff format --check && uv run pytest -q

check-frontend: ## tsc + eslint + vitest + build
	cd frontend && npm run typecheck && npm run lint && npm test && npm run build
