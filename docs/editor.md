---
title: Markdown editing
type: component
created: 2026-10-11
updated: 2026-10-11
status: active
confidence: medium
tags: [editor, markdown, codemirror, tiptap]
sources:
  - app.tsx
  - rich.tsx
  - editor.tsx
  - tabs.ts
  - i18n.ts
  - frontmatter.ts
---

# Markdown editing

TL;DR: The file opener hosts a Tiptap rich editor and a CodeMirror source editor; both update opener state, while the opener owns persistence and navigation.

## Purpose

This component presents Markdown as an editable document, preserves a source mode for exact text work, and provides editor actions such as quote-to-chat and line navigation (`app.tsx:193-219`, `rich.tsx:443-456`).

## How it works

1. The opener constructs a source descriptor from BB’s opener props and requests the file through the typed RPC client (`app.tsx:193-212`, `app.tsx:270-281`).
2. Loaded text is split into front matter and body; the body is passed to the rich editor as Markdown without emitting an edit event (`app.tsx:248-267`).
3. `RichMarkdownEditor` initializes Tiptap from Markdown, installs editing extensions and maps callbacks supplied by the opener (`rich.tsx:458-509`).
4. Rich changes flow through `onChange`; source mode uses CodeMirror and forwards each changed document through its update listener (`rich.tsx:443-457`, `editor.tsx:46-92`).
5. The opener compares the current body and front matter with baselines, then serializes only when dirty; opening without edits returns the original content (`app.tsx:225-244`).
6. Source mode can be toggled in either direction; leaving source mode reparses Markdown and restores the rich document (`app.tsx:410-433`).
7. The opener saves on autosave or the save shortcut and owns conflict handling (`app.tsx:314-375`).

| Mode / state | Input and behavior | Output / failure |
|---|---|---|
| Rich edit | Markdown body and front matter are separated; Tiptap extensions parse the body (`app.tsx:248-267`, `rich.tsx:464-508`). | Rich changes update body state; unmodified files retain their loaded source (`app.tsx:225-244`). |
| Source edit | Full source text is shown through CodeMirror (`app.tsx:410-433`, `editor.tsx:46-109`). | Changed text becomes the save content; invalid Markdown does not block source editing (`editor.tsx:89-91`). |
| YAML properties | Front matter has a separate YAML source editor and properties panel (`app.tsx:111-170`, `app.tsx:227-231`). | Updated YAML rejoins the body on save (`app.tsx:239-244`). |
| Targeted line open | A requested line first seeks a matching rich block, then switches to source view if unmatched (`app.tsx:394-408`, `rich.tsx:413-439`). | Source view selects the requested line range (`editor.tsx:114-120`). |
| Read-only rendering | `RichMarkdownEditor` receives editor callbacks and the containing opener’s state (`rich.tsx:443-456`). | Rich rendering errors are handled by block-specific renderers; persistence failures are surfaced by the opener (`app.tsx:314-352`). |

## Business rules

- A clean rich document uses the exact loaded file content; serialization happens only after a detected change (`app.tsx:225-244`).
- Source mode submits the full source string, while rich mode combines the stored front matter, editor body, and original line ending (`app.tsx:239-244`, `frontmatter.ts:8-20`).
- CodeMirror’s `Mod-s` invokes the opener save callback (`editor.tsx:82-91`); the opener also handles the shortcut at its root (`app.tsx:356-369`).
- The tab context menu closes tabs one at a time after re-querying BB’s tab strip, excludes pinned tabs from close groups, and stores pin names per route (`tabs.ts:16-27`, `tabs.ts:50-58`, `tabs.ts:82-114`).
- Tab menu DOM selectors rely on BB tab-strip data attributes (`tabs.ts:8-12`, `tabs.ts:61-75`).

## Public API or commands

| Import / command | File:line | Purpose |
|---|---|---|
| `MarkdownEditor` | `editor.tsx:46-111` | CodeMirror source editor; accepts `markdown` or `yaml`, change/save callbacks, and optional gutter. |
| `EditorHandle`, `revealLines` | `editor.tsx:44-45`, `editor.tsx:114-120` | Exposes the source view reference and selects a bounded line range. |
| `RichEditorProps`, `AssetResolver`, `Heading`, `RichMarkdownEditor`, `headingsOf`, `scrollToPos`, `revealSourceLine`, `editLinkFlow`, `insertMenuItems`, `RICH_CSS` | `rich.tsx:330-331`, `rich.tsx:386-395`, `rich.tsx:408-457`, `rich.tsx:458-509`, `rich.tsx:713-763`, `rich.tsx:874-933` | Rich editor types, component, navigation helpers, link/menu actions, and styles. |
| `mountTabMenu` | `tabs.ts:61-120` | Installs the side-panel tab context menu. |
| `t`, `detectLocale`, `modKey`, `Locale`, `I18nKey` | `i18n.ts:181-240`, `i18n.ts:361-377` | Locale type, key type, locale detection, and English/Russian UI string lookup. |

## Gotchas

- Source and rich views have different dirty comparisons; source compares full text, rich mode compares normalized body and front matter (`app.tsx:225-238`).
- Tab pin identity is the tab label under the current route, not a persistent tab identifier (`tabs.ts:26-37`, `tabs.ts:104-112`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Architecture](architecture.md)
- [Release checklist](demo.md)
- [Markdown PRO overview](overview.md)
