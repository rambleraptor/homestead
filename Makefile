.PHONY: help install clean lint type-check type-check-cli type-check-server type-check-client type-check-harness build test test-cli test-node test-vm test-e2e test-e2e-ui test-all dev start audit format all ci install-service start-services stop restart status logs homestead homestead-test release

# Release target platforms (filename arch follows Bun's convention: x64/arm64).
RELEASE_PLATFORMS := linux-x64 linux-arm64 darwin-x64 darwin-arm64

# Default target
.DEFAULT_GOAL := help

FRONTEND_DIR := packages/homestead-app
CLI_DIR := packages/homestead-cli
SERVER_DIR := packages/homestead-server
CLIENT_DIR := packages/homestead-client
BUN := $(shell command -v bun || echo $$HOME/.bun/bin/bun)

help: ## Show this help message
	@echo "Homestead - Available Make Targets"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	@echo "Installing workspace dependencies..."
	npm install

clean: ## Remove build artifacts and dependencies
	@echo "Cleaning build artifacts..."
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -rf $(CLI_DIR)/.build
	rm -rf bin

lint: ## Run ESLint
	@echo "Running ESLint..."
	cd $(FRONTEND_DIR) && npm run lint

type-check: type-check-cli type-check-server type-check-client type-check-harness ## Run TypeScript type checking (frontend + CLI + server + client + VM harness)
	@echo "Running TypeScript type check..."
	cd $(FRONTEND_DIR) && npm run type-check

type-check-client: ## Type-check the standalone client library
	@echo "Type-checking homestead-client..."
	npx tsc -p $(CLIENT_DIR)/tsconfig.json

type-check-harness: ## Type-check the VM test harness and VM specs
	@echo "Type-checking homestead-test-harness..."
	npx tsc -p packages/homestead-test-harness/tsconfig.json

type-check-cli: ## Type-check the homestead CLI package
	@echo "Type-checking homestead CLI..."
	npx tsc -p $(CLI_DIR)/tsconfig.json

type-check-server: ## Type-check the homestead-server package
	@echo "Type-checking homestead-server..."
	npx tsc -p $(SERVER_DIR)/tsconfig.json

build: ## Build the SPA (Vite -> frontend/dist)
	@echo "Building SPA..."
	@set -a; if [ -f "$(FRONTEND_DIR)/.env" ]; then . "$(FRONTEND_DIR)/.env"; fi; set +a; \
	  cd $(FRONTEND_DIR) && npm run build

dev: ## Start the full dev stack (server + SPA with HMR, one process)
	@echo "Starting homestead dev stack..."
	$(BUN) packages/homestead-cli/src/cli.ts start --dev

start: homestead ## Build and run the homestead launcher (prod, single binary)
	@echo "Starting homestead..."
	./bin/homestead start

test: test-cli ## Run frontend tests with Vitest (+ CLI tests)
	@echo "Running frontend tests..."
	cd $(FRONTEND_DIR) && npm run test

test-cli: ## Run the homestead CLI + server unit tests (Bun)
	@echo "Running homestead CLI tests..."
	$(BUN) test $(CLI_DIR)/
	@echo "Running homestead-server tests..."
	$(BUN) test $(SERVER_DIR)/

test-node: ## Run the homestead CLI + server unit tests under Node (vitest)
	@echo "Running homestead-server tests (node)..."
	cd $(SERVER_DIR) && npx vitest run
	@echo "Running homestead CLI tests (node)..."
	cd $(CLI_DIR) && npx vitest run

test-vm: ## Run VM-tier tests (real SPA in happy-dom against the in-process server)
	@echo "Running VM tests..."
	cd packages/homestead-test-harness && npx vitest run

test-e2e: ## Run end-to-end tests with Playwright
	@echo "Running e2e tests..."
	cd tests/e2e && npm install && npx playwright install --with-deps chromium && npm test

test-e2e-ui: ## Run e2e tests in UI mode
	@echo "Running e2e tests in UI mode..."
	cd tests/e2e && npm run test:ui

test-all: test test-e2e ## Run all tests (frontend + e2e)
	@echo "All tests completed!"

audit: ## Run security audit
	@echo "Running security audit..."
	cd $(FRONTEND_DIR) && npm audit --audit-level=high

format: ## Format code with Prettier
	@echo "Formatting code with Prettier..."
	cd $(FRONTEND_DIR) && npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"

homestead: ## Build the `homestead` launcher binary (thin: SPA + server run from the project)
	@echo "Building homestead launcher (host platform)..."
	@mkdir -p bin
	$(BUN) build --compile $(CLI_DIR)/src/cli.ts --outfile bin/homestead
	@echo "→ bin/homestead"

homestead-test: type-check-cli type-check-server test-cli ## Type-check + test the CLI and server

release: ## Cross-compile per-platform homestead launcher binaries
	@mkdir -p bin
	@for plat in $(RELEASE_PLATFORMS); do \
	  echo "→ $$plat"; \
	  $(BUN) build --compile --target=bun-$$plat $(CLI_DIR)/src/cli.ts \
	    --outfile bin/homestead-$$plat || exit 1; \
	done
	@echo "→ bin/homestead-<platform> ($(words $(RELEASE_PLATFORMS)) binaries)"

all: install lint type-check build ## Run install, lint, type-check, and build

ci: lint type-check build ## Run CI checks (lint, type-check, build)
	@echo "All CI checks passed!"

# Service management (systemd). `install-service` builds the binary, then has it
# generate + enable the systemd units (main service + auto-update timer).
install-service: homestead ## Install the systemd service + auto-update timer (requires sudo)
	@sudo ./bin/homestead install-service

start-services: ## Start the Homestead service (requires sudo)
	@echo "Starting Homestead service..."
	@sudo systemctl start homestead
	@echo "✅ Service started"

stop: ## Stop the Homestead service (requires sudo)
	@echo "Stopping Homestead service..."
	@sudo systemctl stop homestead
	@echo "✅ Service stopped"

restart: ## Restart the Homestead service (requires sudo)
	@echo "Restarting Homestead service..."
	@sudo systemctl restart homestead
	@echo "✅ Service restarted"

status: ## Check service status
	@sudo systemctl status homestead

logs: ## Follow service logs
	@echo "Following logs (Ctrl+C to stop)..."
	@sudo journalctl -u homestead -f
