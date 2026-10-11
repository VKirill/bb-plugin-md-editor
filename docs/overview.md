---
title: Markdown PRO overview
type: overview
created: 2026-10-11
updated: 2026-10-11
status: active
confidence: medium
tags: [markdown, bb-plugin, editor]
sources:
  - package.json
  - app.tsx
  - rich.tsx
  - server.ts
  - editor.tsx
  - md-extensions.ts
---

# Markdown PRO overview

TL;DR: Markdown PRO is a BB file opener plugin that edits Markdown in a rich view or source view and writes changes through BB file APIs.

## What it is

The plugin registers a BB app and server entry point through `package.json`, and advertises a Markdown file opener in its description (`package.json:1-12`). The frontend loads the selected file, exposes rich and source editing, and calls server RPC for file access (`app.tsx:193-219`).

The rich editor uses Tiptap Markdown parsing with task lists, tables, math, custom HTML, callouts, and diagram node views (`rich.tsx:464-508`). The CodeMirror source editor supports Markdown or YAML mode and forwards document changes to the opener (`editor.tsx:46-92`).

The file opener’s externally visible file behavior is specified in [file access](file-access.md); editor modes and rendered syntax are covered by [editor](editor.md) and [rendering](rendering.md).

## Stack

- TypeScript with BB Plugin SDK `0.4.87` (`package.json:35-38`).
- React types `19.x` and Tiptap `3.31.3` (`package.json:15-34`, `package.json:47-51`).
- CodeMirror 6 packages for source editing (`package.json:14-21`).
- Mermaid `12.0.0`, KaTeX `0.18.7`, lowlight `3.3.0`, and YAML `2.9.1` (`package.json:39-46`).

## Quick start

1. Install the plugin using the procedure in [Deployment](deployment.md).
2. Open a `.md`, `.mdx`, or `.markdown` file; the plugin registers those extensions (`app.tsx:624-631`).
3. Use formatted editing or switch to source view; save with autosave or the save shortcut (`app.tsx:410-433`).

## Where to look next

- [Architecture](architecture.md) — runtime components and call paths
- [File access](file-access.md) — source resolution, RPC, and conflict handling
- [Markdown editor](editor.md) — rich/source editor behavior and public entry points
- [Markdown rendering](rendering.md) — block parsers and views
- [Deployment](deployment.md) — install and local build commands
- [Gotchas](gotchas.md) — constraints to account for during changes

<!-- lane-pilot:backlinks -->
## Referenced by

- [Deployment](deployment.md)
