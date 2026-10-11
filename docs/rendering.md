---
title: Markdown rendering and diagram editing
type: component
created: 2026-10-11
updated: 2026-10-11
status: active
confidence: high
tags: [markdown, mermaid, diagrams, rendering]
sources:
  - rich.tsx
  - views.tsx
  - mermaid-edit.ts
  - box-diagram.ts
  - tree.ts
  - md-extensions.ts
  - i18n.ts
---

# Markdown rendering and diagram editing

TL;DR: The rich editor parses Markdown into Tiptap nodes; custom node views render Mermaid, directory trees, ASCII maps, callouts, HTML regions, code blocks, and math while retaining Markdown as the saved representation.

## Purpose

The editor registers custom renderers and syntax extensions alongside Tiptap’s Markdown parser (`rich.tsx:464-508`). Mermaid and diagram text edits update the document source through node view callbacks (`rich.tsx:213-249`, `rich.tsx:294-309`).

## How it works

1. The Markdown extension parses supported custom constructs into Tiptap nodes; its parser and serializer retain delimiter and attribute data (`md-extensions.ts:27-65`, `md-extensions.ts:459-481`).
2. `CodeBlockView` classifies a code block as Mermaid, ASCII box map, or tree from its language and source; non-visual blocks use code rendering (`rich.tsx:213-228`).
3. Mermaid source is rendered after a 250 ms delay with strict security mode. Render errors display a message in place of the diagram (`rich.tsx:76-103`, `rich.tsx:135-149`).
4. Flowcharts enable a context menu and double-click label editing. Menu operations return replacement Mermaid source and the editor applies it to the code block (`rich.tsx:82-83`, `rich.tsx:120-133`, `rich.tsx:152-185`, `rich.tsx:239-249`).
5. `TreeView` calls `parseTree`; parsed depth, names, folder markers, and comments become rows (`rich.tsx:193-209`, `tree.ts:15-52`).
6. ASCII maps try split/join parsing first, then vertical box parsing; unrecognized explicit ASCII blocks fall back to preformatted text (`views.tsx:198-239`, `box-diagram.ts:96-178`).
7. Math, callout, details, HTML, and ASCII node view extensions are installed in the editor (`rich.tsx:480-506`).

| Block / mode | Detection and output | Failure or edit behavior |
|---|---|---|
| Mermaid | Language `mermaid` selects diagram rendering; only `flowchart` and `graph` sources enable mouse editing (`rich.tsx:213-220`, `mermaid-edit.ts:20-22`). | Render failures show an error label; Mermaid source remains in the code block (`rich.tsx:95-103`, `rich.tsx:135-149`). |
| Mermaid edit operations | Shapes are rectangle, round, stadium, circle, diamond, hexagon, subroutine, database (`mermaid-edit.ts:4-15`). | Add operations append declarations or edges; delete removes a node and incident edges, reconnecting simple direct predecessors to successors (`mermaid-edit.ts:87-102`, `mermaid-edit.ts:121-161`). |
| Directory tree | Explicit `tree` language or a blank language with a tree-like source selects `TreeView`; box-like sources are tested first (`rich.tsx:213-220`). | `looksLikeTree` excludes box-drawing rectangles and needs at least two non-empty lines (`tree.ts:15-21`). |
| ASCII box map | `ascii`, `box`, or `diagram` language, or detected box/fork glyphs, selects `BoxDiagramView` (`rich.tsx:213-220`). | Fork parsing needs split/join borders and at least two branch columns; parse failure falls through to box parser or source text (`box-diagram.ts:95-126`, `views.tsx:198-200`, `views.tsx:226-227`). |
| Code block | Lowlight code view; language can be entered, and blank language can be auto-detected for non-visual code (`rich.tsx:213-228`, `rich.tsx:260-273`). | Blocks longer than 24 lines can collapse; invalid JSON skips pretty formatting (`rich.tsx:211-237`, `rich.tsx:310-317`). |
| Inline math | `$…$` and `\(…\)` retain the delimiter in the node (`md-extensions.ts:459-481`). | Dollar parsing excludes a price-like `$5 and $10` pattern; KaTeX options disable throw-on-error (`md-extensions.ts:459-474`, `rich.tsx:480-485`). |
| Callout | `> [!KIND]` syntax stores kind, optional title, fold marker, and block body (`md-extensions.ts:29-65`). | Unknown kinds use the info tone; only a fixed five-kind menu is shown while the existing kind remains selectable (`views.tsx:10-22`, `views.tsx:24-60`). |

## Business rules

- `setNode` replaces a matching declaration, quotes labels containing Mermaid punctuation, and appends a declaration if the node id is not declared (`mermaid-edit.ts:52-68`).
- `addNode` chooses the next unused `N<number>` id (`mermaid-edit.ts:73-91`).
- `addAfter` creates a plain edge or labeled edge; `connect` appends a plain edge (`mermaid-edit.ts:93-102`).
- `deleteNode` removes the selected id from simple statement chains, preserves other inline declarations, and connects each direct predecessor to each direct successor (`mermaid-edit.ts:121-161`).
- Fork parsing treats the first non-empty row in each branch column as its title and remaining rows as body (`box-diagram.ts:90-93`, `box-diagram.ts:113-125`).
- Box parsing converts top/bottom/side borders into cards, arrow rows into arrows, and other rows into raw text (`box-diagram.ts:145-178`, `views.tsx:226-238`).
- Tree parsing maps distinct indentation widths to depth levels and marks a node as a folder when its name ends in `/` or a following node is deeper (`tree.ts:23-51`).
- `t` selects the requested English or Russian value and replaces platform-specific modifier placeholders (`i18n.ts:361-377`).

## Public API or commands

| Import | File:line | Purpose |
|---|---|---|
| `CALLOUT_KINDS`, `Callout`, `Details`, `htmlRegionBound`, `matchHtmlRegion`, `HtmlRegion`, `RawHtmlBlock`, `RawHtmlInline`, `Kbd`, `Superscript`, `Subscript`, `FootnoteRef`, `FootnoteDef`, `EMOJI`, `Emoji`, `RichInlineMath`, `RichBlockMath`, `AsciiDiagram`, `agentMarkdownExtensions`, `escapeTextMinimal`, `installMinimalEscaping`, `HtmlRegionBound` | `md-extensions.ts:29-30`, `md-extensions.ts:31-65`, `md-extensions.ts:98-154`, `md-extensions.ts:173-321`, `md-extensions.ts:347-550`, `md-extensions.ts:551-603` | Markdown parser, serializer, escaping, and view extensions. |
| `CALLOUT_MENU`, `BoxDiagramView`, `CalloutWithView`, `DetailsWithView`, `HtmlRegionWithView`, `RawHtmlWithView`, `AsciiDiagramWithView` | `views.tsx:22-23`, `views.tsx:198-254` | React node views for callouts, details, HTML, and ASCII maps. |
| `BoxDiagramPart`, `ForkNode`, `ForkDiagram`, `isBoxTop`, `isBoxBottom`, `isBoxSide`, `isArrowLine`, `isBoxDiagramLine`, `looksLikeForkDiagram`, `parseForkDiagram`, `looksLikeBoxDiagram`, `parseBoxDiagram`, `matchAsciiDiagram` | `box-diagram.ts:9-50`, `box-diagram.ts:95-225` | Types, detection, and parsing for ASCII box and fork maps. |
| `TreeNode`, `looksLikeTree`, `parseTree` | `tree.ts:10-52` | Detect and parse directory tree source. |
| `Shape`, `SHAPES`, `isFlowchart`, `findDeclaration`, `labelOf`, `renameNode`, `reshapeNode`, `nextId`, `addNode`, `addAfter`, `connect`, `deleteNode`, `nodeIdFromSvg` | `mermaid-edit.ts:4-23`, `mermaid-edit.ts:27-51`, `mermaid-edit.ts:70-102`, `mermaid-edit.ts:121-170` | Inspect and transform Mermaid flowchart source. |

## Gotchas

- Mermaid editing is enabled only for recognized flowchart headers; other Mermaid diagram types render but do not expose that context menu (`rich.tsx:82-83`, `mermaid-edit.ts:20-22`).
- The box parser deliberately refuses fork markers as a vertical box map, so fork recognition must run first (`box-diagram.ts:128-139`, `views.tsx:198-200`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Architecture](architecture.md)
- [Release checklist](demo.md)
- [Markdown PRO overview](overview.md)
