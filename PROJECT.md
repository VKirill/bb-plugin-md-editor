---
title: Markdown PRO — project facts
updated: 2026-10-18
sources:
  - package.json
  - app.tsx
  - i18n.ts
  - server.ts
  - locate.ts
  - docs/architecture.md
  - docs/file-access.md
  - docs/editor.md
  - docs/rendering.md
  - docs/gotchas.md
  - font-size.ts
---

# Markdown PRO — project facts

## Identity

- BB plugin package: `bb-plugin-md-editor`, version `0.1.4` (`package.json:1-3`).
- Plugin display name: Markdown PRO (`package.json:9-11`).
- License: MIT (`package.json:94`).
- Product summary: [overview](docs/overview.md).

## Entry points

- BB app: `app.tsx` (`package.json:15-16`).
- Server RPC plugin: `server.ts` (`package.json:15-16`).
- BB skill directory: `skills/` (`package.json:17-19`).
- File-opening lifecycle: [file access](docs/file-access.md).

## Critical invariants

- Source location resolves to the owning host; it does not fall back to another machine (`locate.ts:1-3`, `locate.ts:91-132`). See [file access](docs/file-access.md).
- Workspace relative paths stay under the selected root; absolute workspace paths are used directly (`locate.ts:49-55`, `locate.ts:112-115`). See [file access](docs/file-access.md).
- Save sends expected SHA-256 and surfaces conflict instead of silently overwriting (`server.ts:44-49`, `server.ts:114-122`).
- Rich mode compares normalized body and front matter with their baselines; a clean rich document composes to the loaded file content (`app.tsx:259-277`). See [editor](docs/editor.md).

## Conventions

- Keep Markdown as the rich editor’s source representation (`rich.tsx:464-508`). See [rendering](docs/rendering.md).
- Keep machine/path behavior in `locate.ts` and RPC handlers in `server.ts` (`server.ts:77-123`).
- UI strings go through `t`; it selects English or Russian, then expands platform shortcut tokens (`i18n.ts:391-406`). See [editor](docs/editor.md).

## Common gotchas

- Tab menu depends on BB tab-strip data attributes (`tabs.ts:8-12`). See [gotchas](docs/gotchas.md).
- Rich edits normalize Markdown; source mode compares and saves the full source text (`app.tsx:270-277`, `app.tsx:273-278`).
- Mermaid mouse edits apply to flowcharts and graph diagrams (`mermaid-edit.ts:20-22`). See [rendering](docs/rendering.md).
- Editor typography preference behavior: [editor](docs/editor.md#how-it-works).

## Useful commands

- `npm install` — install dependencies.
- `npm test` — run the Node test suites (`package.json:90`).
- `npm run typecheck` — run TypeScript checking (`package.json:91`).
- `npm run build` — build the BB plugin (`package.json:92`).
- `bb plugin install . --yes` — install a local build (`README.md:28-36`).

## Where to look next

- [Architecture](docs/architecture.md)
- [Editor](docs/editor.md)
- [File access](docs/file-access.md)
- [Rendering](docs/rendering.md)
- [Deployment](docs/deployment.md)
- [Gotchas](docs/gotchas.md)
