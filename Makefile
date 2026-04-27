.PHONY: help install clean lint type-check build test test-e2e test-e2e-ui test-all dev start audit format all ci deploy setup-services start-services stop restart status logs

# Default target
.DEFAULT_GOAL := help

FRONTEND_DIR := frontend

help: ## Show this help message
	@echo "Homestead - Available Make Targets"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	@echo "Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install

clean: ## Remove build artifacts and dependencies
	@echo "Cleaning build artifacts..."
	rm -rf $(FRONTEND_DIR)/.next
	rm -rf $(FRONTEND_DIR)/node_modules

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

test-e2e: ## Run e2e tests against the docker-compose stack
	@./tests/e2e/run-with-stack.sh

test-e2e-ui: ## Run e2e tests in UI mode against the docker-compose stack
	@./tests/e2e/run-with-stack.sh run test:ui

test-all: test test-e2e ## Run all tests (frontend + e2e)
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
deploy: ## Deploy Homestead (run as sudo)
	@./deployment/deploy.sh

deploy-force: ## Force deploy with rebuild
	@./deployment/deploy.sh --force

setup-services: ## Set up systemd services (requires sudo)
	@sudo ./deployment/setup-services.sh

setup-auto-update: ## Set up automatic updates (requires sudo)
	@sudo ./deployment/setup-auto-update.sh

start-services: ## Start Homestead services (requires sudo)
	@echo "Starting Homestead services..."
	@sudo systemctl start homeos-aepbase homeos-frontend
	@echo "✅ Services started"

stop: ## Stop Homestead services (requires sudo)
	@echo "Stopping Homestead services..."
	@sudo systemctl stop homeos-aepbase homeos-frontend
	@echo "✅ Services stopped"

restart: ## Restart Homestead services (requires sudo)
	@echo "Restarting Homestead services..."
	@sudo systemctl restart homeos-aepbase homeos-frontend
	@echo "✅ Services restarted"

status: ## Check service status
	@sudo systemctl status homeos-aepbase homeos-frontend

logs: ## Follow service logs
	@echo "Following logs (Ctrl+C to stop)..."
	@sudo journalctl -u homeos-aepbase -u homeos-frontend -f

logs-aepbase: ## Follow aepbase logs
	@sudo journalctl -u homeos-aepbase -f

logs-frontend: ## Follow frontend logs
	@sudo journalctl -u homeos-frontend -f
