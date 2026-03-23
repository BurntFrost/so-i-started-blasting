---
name: preview
description: Launch dev server, open the app in a browser, and take a screenshot to verify visual output
---

# Preview Skill

Launch the dev server and capture a screenshot of the running app.

## Steps

1. Check if dev server is already running on port 3000, if not start it in background:
   ```bash
   lsof -i :3000 >/dev/null 2>&1 || npm run dev &
   ```

2. Wait for server to be ready (poll until responding):
   ```bash
   for i in {1..15}; do curl -s http://localhost:3000 >/dev/null && break; sleep 1; done
   ```

3. Use Playwright MCP to navigate to `http://localhost:3000` and take a screenshot

4. Show the screenshot to the user and describe what you see — focus on:
   - Is the CRT TV rendering correctly?
   - Are there any visual glitches?
   - Is the scene info bar displaying properly?
   - Any console errors?
