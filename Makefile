# ──────────────────────────────────────────────────────────────
# TicketOps — Common operations
# ──────────────────────────────────────────────────────────────
.PHONY: install run desktop package clean help

PYTHON ?= python3

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install Python deps + desktop (npm) deps
	$(PYTHON) build.py setup

run: ## Run Flask directly (dev mode)
	$(PYTHON) app.py

start: ## Launch via start.py (browser auto-opens)
	$(PYTHON) start.py

desktop: ## Launch Electron desktop app
	@if [ -f desktop/start-electron.sh ]; then \
		bash desktop/start-electron.sh; \
	else \
		echo "[ERROR] desktop/start-electron.sh not found"; exit 1; \
	fi

package: ## Build distributable executable via PyInstaller
	$(PYTHON) build.py package

clean: ## Remove build artifacts (dist/, build/, __pycache__)
	$(PYTHON) build.py clean
