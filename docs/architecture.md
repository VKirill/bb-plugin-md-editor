---
title: Architecture
type: architecture
created: 2026-10-11
updated: 2026-10-11
status: active
confidence: high
tags: [architecture, bb-plugin, markdown]
sources:
  - package.json
  - app.tsx
  - server.ts
  - locate.ts
  - rich.tsx
  - editor.tsx
  - views.tsx
  - links.ts
  - mermaid-edit.ts
  - tabs.ts
  - i18n.ts
  - md-extensions.ts
---

# Architecture

TL;DR: BB mounts a React file opener and a server plugin; the opener delegates file I/O to server RPC and composes CodeMirror, Tiptap, and Markdown-specific node views.

## System Context

```mermaid
C4Context
  title System Context
  Person(user, "BB user", "Opens and edits Markdown")
  System(bb, "BB", "Hosts plugin UI, RPC, navigation, and file APIs")
  System(plugin, "Markdown PRO", "Renders and edits Markdown files")
  Rel(user, bb, "Opens file and edits document")
  Rel(bb, plugin, "Mounts app and RPC plugin")
  Rel(plugin, bb, "Calls file, preview, and navigation APIs")
```

BB supplies the app/server entry points declared in the package manifest; the plugin’s server registers its RPC contract (`package.json:4-12`, `server.ts:65-78`).

## Containers

```mermaid
C4Container
  title Plugin containers
  Container_Boundary(plugin, "Markdown PRO") {
    Container(app, "File opener", "React", "Rich/source editing and save state")
    Container(rich, "Rich editor", "Tiptap", "Markdown nodes and views")
    Container(source, "Source editor", "CodeMirror", "Markdown and YAML text editing")
    Container(server, "RPC handlers", "BB Plugin SDK", "Resolve, read, preview, and save files")
    Container(resolver, "Location resolver", "Node path", "Map BB source to host and absolute path")
  }
  System_Ext(bb, "BB APIs", "File, host, thread, environment, project, and navigation APIs")
  Rel(app, rich, "Mounts rich editor")
  Rel(app, source, "Mounts source editor")
  Rel(app, server, "Calls typed RPC")
  Rel(server, resolver, "Resolves file source")
  Rel(server, bb, "Uses SDK")
  Rel(app, bb, "Uses navigation and composer")
```

The React opener imports the rich/source editors and calls RPC (`app.tsx:7-22`, `app.tsx:193-212`). The server handler delegates source resolution to `locate` and file operations to BB SDK methods (`server.ts:77-123`, `locate.ts:91-132`).

## Building Blocks

- [Markdown editing](editor.md) — file opener, Tiptap and CodeMirror editor surfaces, and tab menu.
- [Markdown file access](file-access.md) — RPC contract, source routing, read and conditional save.
- [Markdown rendering and diagram editing](rendering.md) — custom Markdown nodes, code blocks, and diagrams.

## Key Flows

### Open a Markdown file

```mermaid
sequenceDiagram
  participant BB as BB file opener
  participant App as MarkdownFileOpener
  participant RPC as Plugin RPC
  participant Locate as locate
  participant Files as BB file API
  BB->>App: path and opener source
  App->>RPC: open(request)
  RPC->>Locate: resolve(source, path)
  Locate-->>RPC: host and absolute path
  RPC->>Files: read(hostId, absPath)
  Files-->>App: content and SHA-256
  App->>App: split front matter and initialize rich editor
```

Evidence: opener request and load (`app.tsx:193-212`, `app.tsx:270-281`), RPC resolution and read (`server.ts:77-95`).

### Save edited content

```mermaid
sequenceDiagram
  participant App as MarkdownFileOpener
  participant RPC as Plugin RPC
  participant Locate as locate
  participant Files as BB file API
  App->>App: compose content and expected hash
  App->>RPC: save(content, expectedSha256)
  RPC->>Locate: resolve(source, path)
  RPC->>Files: write(expectedSha256)
  alt matching hash
    Files-->>App: written and new SHA-256
  else changed file
    Files-->>App: conflict
  end
```

Evidence: composition and call (`app.tsx:314-352`), compare-and-swap write (`server.ts:114-122`).

### Edit a Mermaid flowchart

```mermaid
sequenceDiagram
  participant User
  participant Diagram as MermaidDiagram
  participant Edit as mermaid-edit
  participant Editor as Tiptap code block
  User->>Diagram: context menu or double click
  Diagram->>Edit: add, rename, reshape, or delete
  Edit-->>Diagram: updated Mermaid source
  Diagram->>Editor: onChange(source)
  Editor-->>User: rerendered diagram
```

Evidence: menu operation handlers and callback (`rich.tsx:120-185`), source update (`rich.tsx:239-249`), edit transforms (`mermaid-edit.ts:57-102`, `mermaid-edit.ts:121-161`).

## Invariants

- File operations use a resolved host id and absolute path; source resolution does not choose another machine as fallback (`locate.ts:1-3`, `locate.ts:91-132`).
- Relative workspace paths are constrained under their root (`locate.ts:48-56`, `locate.ts:99-115`).
- The app preserves loaded source bytes when the rich document remains clean (`app.tsx:225-244`).
- Saves include the loaded hash and expose conflict instead of silently overwriting a changed file (`app.tsx:322-331`, `server.ts:114-122`).
- Markdown is the source representation for rich node edits (`rich.tsx:464-508`, `mermaid-edit.ts:1-2`).

## Cross-cutting concerns

**Errors:** RPC open localizes file-not-found and unavailable-machine errors; save failures distinguish conflict, missing file, and other error state (`server.ts:53-63`, `app.tsx:327-349`). See [file access](file-access.md).

**Internationalization:** UI locale derives from the document language and selects English or Russian strings (`i18n.ts:363-377`).

**Asset access:** The opener requests a temporary file preview base and rewrites only relative image paths inside the configured root (`server.ts:108-112`, `app.tsx:289-312`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Markdown PRO overview](overview.md)
