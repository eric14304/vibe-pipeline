# vibe-pipeline

Multi-AI agent ticket / pipeline orchestrator. Each ticket is run by an **executor** AI and reviewed by a **critic** AI; iterative tickets auto-loop until the critic passes. Pipelines are ordered tickets that run on isolated git branches and merge back when done.

Web UI for daily use, `vbpl` CLI for terminal workflows. Backend reuses the same modules either way (no HTTP-only paths).

---

## Quick start

Requires [Bun](https://bun.sh) (≥ 1.1) + Git.

```bash
bun install
bun run dev:all       # vite (5173) + bun server (3001) concurrent
# open http://127.0.0.1:5173/board
```

Or run them separately:

```bash
bun run dev           # frontend
bun run server        # backend
```

Build CLI binary:

```bash
bun run cli:build           # Windows
bun run cli:build:mac       # macOS arm64
bun run cli:build:linux     # Linux x64
# → dist-cli/vbpl[.exe]
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Web UI (Vite + React 18)                                    │
│   ↓ /api/* proxy                                             │
│  Bun server (3001)                                           │
│   ↓ spawn                                                    │
│  AI runner (claude-code / codex CLI)                         │
│   ↓ Task / Bash                                              │
│  Executor sub-agent          Critic sub-agent                │
│   (real edits, high-cap)      (read-only diff judge)         │
└──────────────────────────────────────────────────────────────┘

`vbpl` CLI ─── reuses server/lib/* directly for read ops
           └── POSTs to backend for spawn/kill ops
```

Per-task AI configuration (model + reasoning effort):

| Task class | Default | What it does |
|---|---|---|
| `qa` | sonnet-4-6 / low | Conversational ticket spec refinement |
| `split` | sonnet-4-6 / low | One-shot "is this 1 ticket or N?" splitter |
| `runner` | opus-4-7 / medium | Pipeline main agent (orchestrates tickets) |
| `executor` | opus-4-7 / high | Writes / edits code |
| `critic` | sonnet-4-6 / medium | Reads diff, PASS / FAIL / PARTIAL |
| `merge` | opus-4-7 / high | Conflict resolution on merge |

User can swap providers (claude / codex) and models per task class from Settings.

---

## Features

- **Pipeline = ordered ticket list** on its own git branch, runs in `~/.vibe-pipeline/worktrees/<projHash>/<pipelineId>/`
- **QA drawer**: chat with AI to spec out a ticket; auto-splits when the AI sees the scope spans multiple independent tickets
- **Iterative mode**: executor → critic → retry loop until PASS or iter limit
- **Auto-merge** (when all tickets done + `autoMerge=true`): backend tries pure `git merge --no-ff` first; only spawns AI if there's a real conflict
- **Sync**: pull base branch into a pipeline's worktree, same git-first → AI-on-conflict flow
- **Cross-provider sub-agents**: claude main → Task tool; codex → Bash directly to `codex exec`
- **PWA + Tailscale + TOTP**: run desktop server, access from phone via Tailscale HTTPS, TOTP-gated for non-loopback access, FCM push for ticket events
- **CLI `vbpl`**: 4 nouns (project / pipeline / ticket / config), `--json` mode for scripting; spawn ops go through backend HTTP so children don't orphan
- **State recovery**: crash-safe — server boot scans pipelines and reconciles `running`/`stopping` stale states; runtime watchdog catches dead PIDs

---

## CLI

```bash
# Install (after `bun run cli:build`)
mkdir ~/bin && cp dist-cli/vbpl* ~/bin/   # add ~/bin to PATH

# Common verbs
vbpl project list
vbpl pipeline list --project <hash>
vbpl pipeline status <id>
vbpl pipeline run <id>                                          # spawn runner (needs backend)
vbpl pipeline log <id>                                          # past run summaries
vbpl ticket add --pipeline <id> --title "..." --mode iter
vbpl config set runner.model claude-opus-4-7
vbpl pipeline sync <id>                                         # git merge base → worktree
vbpl pipeline sync <id> --ai                                    # AI resolves conflicts
vbpl pipeline merge <id>                                        # AI merge to base
```

`--json` works on every verb for piping into `jq` / PowerShell `ConvertFrom-Json`.

---

## Remote access (Tailscale)

1. Install Tailscale on host + phone (same tailnet)
2. `tailscale serve --https=443 http://localhost:5173` on host
3. Open `https://<machine>.<tailnet>.ts.net` on phone, install as PWA
4. First connection from non-loopback → TOTP setup (scan QR with Authenticator app, then login each new session)
5. Enable push in Settings → 「Push Notifications」 to get ticket events on phone

See [`CLAUDE.md`](CLAUDE.md) § 手機遠端使用方式 for FCM service-account setup.

---

## Repo layout

```
src/         frontend (Vite + React)
server/      Bun backend (one route file per domain, lib/ for pure logic)
cli/         vbpl CLI (reuses server/lib/*)
shared/      cross-side persistence types
.claude/     skills / refs for AI editors working on this repo
public/      static (PWA manifest, service worker, icons)
tests/e2e/   Playwright (mock CI mode + real mode)
```

Each layer has a SKILL doc under `.claude/skills/` describing conventions in detail — read those before non-trivial changes:

- [vibe-pipeline](.claude/skills/vibe-pipeline/SKILL.md) — product / scope / refs
- [vibe-pipeline-frontend](.claude/skills/vibe-pipeline-frontend/SKILL.md) — UI conventions
- [vibe-pipeline-backend](.claude/skills/vibe-pipeline-backend/SKILL.md) — server / runner / sync
- [vibe-pipeline-cli](.claude/skills/vibe-pipeline-cli/SKILL.md) — CLI conventions
- [vibe-pipeline-e2e](.claude/skills/vibe-pipeline-e2e/SKILL.md) — Playwright coverage matrix

---

## Status

Phase 1-5 landed (CRUD + QA + Runner + Worktree + Merge/Sync + Auto + Tailscale + TOTP + FCM + cross-provider sub-agent + CLI). Self-dogfooding: the project manages its own development via its own pipelines.

Currently working but not polished:
- Budget tracker UI (cost limits already enforced server-side, missing dashboard)
- Transient retry fixture (no natural reproduction case yet)
- iOS PWA push (Android verified, iOS needs manual install + 16.4+)
- `vbpl pipeline log --follow` (currently one-shot, not tailing)

---

## Scripts

| Command | Purpose |
|---|---|
| `bun run dev` | Vite frontend (5173) |
| `bun run server` | Bun backend (3001, no watch) |
| `bun run server:watch` | Backend with hot reload (don't use during self-merge — `bun --watch` reload kills spawned runner children) |
| `bun run dev:all` | Both concurrently |
| `bun run build` | `tsc -b && vite build` |
| `bun run lint` | Biome lint |
| `bun run test:e2e` | Playwright mock mode (CI default) |
| `bun run test:e2e:real` | Playwright real mode (burns tokens; opt-in) |
| `bun run vbpl <noun> <verb>` | CLI dev mode (no rebuild) |
| `bun run cli:build` | Compile CLI to single binary |
| `bun run icons` | Regenerate PWA icons from `public/icon.svg` (needs ImageMagick) |

---

## License

No license declared — currently for personal / collaborator use. Open an issue if you want clarification on a specific use case.
