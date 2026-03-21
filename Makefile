.PHONY: dev-services-no-watch dev-services-no-watch-stop dev-apps-no-watch dev-apps-no-watch-stop dev-all-no-watch dev-all-no-watch-stop

LOG_DIR := .dev-services
PID_DIR := $(LOG_DIR)/pids
SERVICES := content-service knowledge-graph-service scheduler-service session-service user-service
APPS := web web-admin

dev-services-no-watch:
	mkdir -p "$(PID_DIR)"
	pnpm run docker:up
	pnpm run build:packages
	pnpm run build:services
	@for service in $(SERVICES); do \
		pid_file="$(PID_DIR)/$$service.pid"; \
		if [ -f "$$pid_file" ] && kill -0 "$$(cat "$$pid_file")" 2>/dev/null; then \
			echo "$$service is already running (PID $$(cat "$$pid_file"))"; \
			continue; \
		fi; \
		rm -f "$$pid_file"; \
		log_file="$(LOG_DIR)/$$service.log"; \
		nohup sh -c "cd services/$$service && pnpm start" > "$$log_file" 2>&1 & \
		echo $$! > "$$pid_file"; \
		echo "Started $$service (PID $$(cat "$$pid_file"))"; \
	done

dev-services-no-watch-stop:
	@for service in $(SERVICES); do \
		pid_file="$(PID_DIR)/$$service.pid"; \
		if [ ! -f "$$pid_file" ]; then \
			continue; \
		fi; \
		pid="$$(cat "$$pid_file")"; \
		if kill -0 "$$pid" 2>/dev/null; then \
			kill "$$pid"; \
			echo "Stopped $$service (PID $$pid)"; \
		fi; \
		rm -f "$$pid_file"; \
	done

dev-apps-no-watch:
	mkdir -p "$(PID_DIR)"
	pnpm --filter @noema/web build
	pnpm --filter @noema/web-admin build
	@for app in $(APPS); do \
		pid_file="$(PID_DIR)/$$app.pid"; \
		if [ -f "$$pid_file" ] && kill -0 "$$(cat "$$pid_file")" 2>/dev/null; then \
			echo "$$app is already running (PID $$(cat "$$pid_file"))"; \
			continue; \
		fi; \
		rm -f "$$pid_file"; \
		log_file="$(LOG_DIR)/$$app.log"; \
		nohup sh -c "cd apps/$$app && pnpm start" > "$$log_file" 2>&1 & \
		echo $$! > "$$pid_file"; \
		echo "Started $$app (PID $$(cat "$$pid_file"))"; \
	done

dev-apps-no-watch-stop:
	@for app in $(APPS); do \
		pid_file="$(PID_DIR)/$$app.pid"; \
		if [ ! -f "$$pid_file" ]; then \
			continue; \
		fi; \
		pid="$$(cat "$$pid_file")"; \
		if kill -0 "$$pid" 2>/dev/null; then \
			kill "$$pid"; \
			echo "Stopped $$app (PID $$pid)"; \
		fi; \
		rm -f "$$pid_file"; \
	done

dev-all-no-watch: dev-services-no-watch dev-apps-no-watch

dev-all-no-watch-stop: dev-apps-no-watch-stop dev-services-no-watch-stop
