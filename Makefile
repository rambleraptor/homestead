.PHONY: help install clean lint type-check build test test-migrations test-hooks test-all dev preview audit format all ci

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
	rm -rf $(FRONTEND_DIR)/dist
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

preview: ## Preview production build
	@echo "Previewing production build..."
	cd $(FRONTEND_DIR) && npm run preview

test: ## Run frontend tests with Vitest
	@echo "Running frontend tests..."
	cd $(FRONTEND_DIR) && npm run test

test-migrations: ## Run PocketBase migration tests
	@echo "Running migration tests..."
	npm test --prefix tests/migrations

test-hooks: ## Run PocketBase hook validation tests
	@echo "Running hook validation tests..."
	node tests/hooks/test-notification-hook.js

test-all: test test-migrations test-hooks ## Run all tests (frontend + migrations + hooks)
	@echo "All tests completed!"

audit: ## Run security audit
	@echo "Running security audit..."
	cd $(FRONTEND_DIR) && npm audit --audit-level=high

format: ## Format code (placeholder - add prettier/formatter as needed)
	@echo "No formatter configured yet"
	@echo "Consider adding prettier to your project"

all: install lint type-check build ## Run install, lint, type-check, and build

ci: lint type-check build ## Run CI checks (lint, type-check, build)
	@echo "All CI checks passed!"
