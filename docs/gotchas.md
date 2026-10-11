---
title: Gotchas
type: gotchas
created: 2026-10-11
updated: 2026-10-11
status: active
confidence: medium
tags: [gotchas, compatibility, files]
sources:
  - tabs.ts
  - locate.ts
  - app.tsx
  - server.ts
---

# Gotchas

TL;DR: Changes to BB’s tab-strip markup, file path context, or save conflict state can change behavior outside the visible editor surface.

## Critical

### Save conflicts stop the current save

**Problem:** A compare-and-swap write can return `conflict`; the opener sets conflict state and exits without updating the loaded baseline (`server.ts:44-49`, `app.tsx:327-331`).

**Risk:** A follow-up autosave is paused while the conflict state remains active (`app.tsx:371-375`).

**Workaround:** Resolve or reload the external change before resuming edits; the UI state and conditional write path are in [file access](file-access.md).

## High

### Path resolution depends on the BB source context

**Problem:** Workspace paths need an environment, thread, or project source; host paths require an absolute path (`locate.ts:99-132`).

**Risk:** A file reference without an owning machine or resolvable folder fails rather than silently opening from another host (`locate.ts:1-3`, `locate.ts:110-132`).

**Workaround:** Preserve BB’s opener source identifiers and resolve relative paths beneath their source root (`app.tsx:198-210`, `locate.ts:91-115`).

### Tab menu reads BB-private markup

**Problem:** The content script locates the strip, tab contents, and close controls through BB `data-*` selectors (`tabs.ts:8-12`).

**Risk:** A markup change can prevent tab menu mounting; the script relies on those selectors (`tabs.ts:61-75`, `tabs.ts:139-177`).

**Workaround:** Check selectors and observer behavior against BB’s current panel DOM when changing this integration (`tabs.ts:61-75`, `tabs.ts:139-177`).

## Medium

### Pinned tabs are keyed by route and label

**Problem:** Pin state is stored in local storage under the current route and tab label (`tabs.ts:14-37`, `tabs.ts:104-112`).

**Risk:** Duplicate labels on one route share a pin identity, and a label change no longer matches the stored pin (`tabs.ts:29-37`, `tabs.ts:104-112`).

**Workaround:** Keep pin identity assumptions in mind when changing tab labels or storage format (`tabs.ts:14-27`).

### Rich view normalizes Markdown after edits

**Problem:** Rich mode compares normalized editor body and front matter; source mode compares the original full text (`app.tsx:225-244`).

**Risk:** Rich serialization can differ from original formatting after a real edit, even though opening alone does not mark the file dirty (`app.tsx:225-244`, `app.tsx:248-267`).

**Workaround:** Use source mode when exact Markdown formatting is the editing target (`app.tsx:410-433`).

## Low

No additional low-severity code constraint is documented.

<!-- lane-pilot:backlinks -->
## Referenced by

- [Markdown PRO overview](overview.md)
