.PHONY: help install clean lint type-check build test test-migrations test-hooks test-auto-update test-e2e test-all dev start audit format all ci deploy setup-services start-services stop restart status logs

# Default target
.DEFAULT_GOAL := help

# Frontend directory
FRONTEND_DIR := frontend

help: ## Show this help message
	@echo "HomeOS - Available Make Targets"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	@echo "Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install

clean: ## Remove build artifacts and dependencies
	@echo "Cleaning build artifacts..."
	rm -rf $(FRONTEND_DIR)/.next
	rm -rf $(FRONTEND_DIR)/node_modules
	@echo "Cleaning migration test artifacts..."
	cd tests/migrations && npm run clean 2>/dev/null || true

lint: ## Run ESLint
	@echo "Running ESLint..."
	cd $(FRONTEND_DIR) && npm run lint

type-check: ## Run TypeScript type checking
	@echo "Running TypeScript type check..."
	cd $(FRONTEND_DIR) && npm run type-check

build: ## Build for production
	@echo "Building application..."
	cd $(FRONTEND_DIR) && npm run build

dev: ## Start development server
	@echo "Starting development server..."
	cd $(FRONTEND_DIR) && npm run dev

start: ## Start production server
	@echo "Starting production server..."
	cd $(FRONTEND_DIR) && npm run start

test: ## Run frontend tests with Vitest
	@echo "Running frontend tests..."
	cd $(FRONTEND_DIR) && npm run test

test-migrations: ## Run PocketBase migration tests
	@echo "Running migration tests..."
	npm test --prefix tests/migrations

test-hooks: ## Run PocketBase hook validation tests
	@echo "Running hook validation tests..."
	node tests/hooks/test-notification-hook.js

test-auto-update: ## Run auto-update script tests
	@echo "Running auto-update tests..."
	@./tests/deployment/test-auto-update.sh

test-e2e: ## Run end-to-end tests with Playwright
	@echo "Running e2e tests..."
	cd tests/e2e && npm install && npx playwright install --with-deps chromium && npm test

test-e2e-ui: ## Run e2e tests in UI mode
	@echo "Running e2e tests in UI mode..."
	cd tests/e2e && npm run test:ui

test-all: test test-migrations test-hooks test-auto-update ## Run all tests (frontend + migrations + hooks + auto-update)
	@echo "All tests completed!"

audit: ## Run security audit
	@echo "Running security audit..."
	cd $(FRONTEND_DIR) && npm audit --audit-level=high

format: ## Format code with Prettier
	@echo "Formatting code with Prettier..."
	cd $(FRONTEND_DIR) && npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"

all: install lint type-check build ## Run install, lint, type-check, and build

ci: lint type-check build ## Run CI checks (lint, type-check, build)
	@echo "All CI checks passed!"

# Deployment targets
deploy: ## Deploy HomeOS (run as sudo)
	@./deployment/deploy.sh

deploy-force: ## Force deploy with rebuild
	@./deployment/deploy.sh --force

setup-services: ## Set up systemd services (requires sudo)
	@sudo ./deployment/setup-services.sh

setup-auto-update: ## Set up automatic updates (requires sudo)
	@sudo ./deployment/setup-auto-update.sh

start-services: ## Start HomeOS services (requires sudo)
	@echo "Starting HomeOS services..."
	@sudo systemctl start homeos-pocketbase homeos-frontend
	@echo "✅ Services started"

stop: ## Stop HomeOS services (requires sudo)
	@echo "Stopping HomeOS services..."
	@sudo systemctl stop homeos-pocketbase homeos-frontend
	@echo "✅ Services stopped"

restart: ## Restart HomeOS services (requires sudo)
	@echo "Restarting HomeOS services..."
	@sudo systemctl restart homeos-pocketbase homeos-frontend
	@echo "✅ Services restarted"

status: ## Check service status
	@sudo systemctl status homeos-pocketbase homeos-frontend

logs: ## Follow service logs
	@echo "Following logs (Ctrl+C to stop)..."
	@sudo journalctl -u homeos-pocketbase -u homeos-frontend -f

logs-pocketbase: ## Follow PocketBase logs
	@sudo journalctl -u homeos-pocketbase -f

logs-frontend: ## Follow frontend logs
	@sudo journalctl -u homeos-frontend -f
