# Noema Agents

Python agent package for lesson planning, content generation, and curriculum proposal endpoints.

Run the local HTTP service from the repository root with:

```powershell
python -m uvicorn agents.app:app --host 0.0.0.0 --port 8011 --reload
```

The service loads `agents/.env.local` on startup.

Use `pnpm run agents:check` from the repository root to install the development extras and run Ruff, MyPy, and pytest in a reproducible way.
