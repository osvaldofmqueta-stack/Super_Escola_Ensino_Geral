---
name: Bash background processes across tool calls
description: Long-running commands (e.g. expo export) started with &/nohup in the bash tool can silently die between tool-call invocations
---

Background processes started directly via the bash tool (using `&`, `nohup`, `disown`, `setsid`, or a bare `sleep N; cmd`) are unreliable across separate tool calls — they sometimes get reaped between invocations even though the previous call reported normal progress. Re-invoking the same command from scratch each time also doesn't resume (e.g. Metro bundling restarts from 0%), wasting minutes.

**Why:** the bash tool's underlying shell session is not guaranteed to persist a detached child process across tool-call boundaries in this sandbox, unlike a real long-lived terminal.

**How to apply:** for genuinely long builds/tasks, prefer letting them run inside a process that Replit itself manages and keeps alive — e.g. a workflow's own shell (like `scripts/start.sh` backgrounding `npx expo export` before exec-ing the server). Restart the workflow to kick it off, then poll progress via `refresh_all_logs` / the build's own log file instead of via ad-hoc bash background jobs. If a workflow restart times out waiting for the port, it may just mean startup (migrations, etc.) is slow — check logs/process before assuming failure, then restart again.

**Important nuance:** if `start.sh` runs the build *synchronously before* opening the app's port (blocking `exec`), the platform will kill the whole workflow process group (including the build) once the port-open timeout is exceeded — repeated restarts just reset build progress to 0% forever. Fix: make `start.sh` launch the build with `&` (backgrounded) so the server/port opens immediately while the build finishes independently as a child of the long-lived workflow process; poll its log file instead of the workflow restart tool.
