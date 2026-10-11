---
title: Release checklist
type: overview
created: 2026-09-16
updated: 2026-10-11
status: active
confidence: medium
tags: [demo, markdown, release-checklist]
sources:
  - rich.tsx
  - views.tsx
  - md-extensions.ts
  - box-diagram.ts
  - tree.ts
  - package.json
---

# Release checklist

TL;DR: This sample shows Markdown source patterns rendered by the rich editor; checklist names, statuses, thread IDs, and task keys below are sample content (`rich.tsx:464-508`, `views.tsx:198-249`).

## What it is

The file demonstrates callouts, details, math, code blocks, directory trees, Mermaid, and ASCII box maps supported by Markdown PRO (`md-extensions.ts:27-65`, `md-extensions.ts:459-550`, `rich.tsx:213-228`). The release notes, CI statuses, and identifiers are fixture text, not a report about this repository.

## Stack

The editor uses Tiptap `3.31.3`, Mermaid `12.0.0`, and KaTeX `0.18.7` (`package.json:25-46`).

This document shows what **Markdown PRO** renders from plain Markdown that agents write: ==highlights==, `inline code`, <kbd>Cmd</kbd>+<kbd>S</kbd>, H<sub>2</sub>O, x<sup>2</sup> and file names like `release_notes.md` stay intact on save.

> [!NOTE]
> Agents love callouts. They render as colored panels and save back exactly as written.

> [!WARNING] Before you publish
> Run the full test suite. Current status: FAIL on staging, PASS on local ✅

> [!TIP]- Collapsed tip
> Click the arrow to expand.

<details>
<summary>Full build log</summary>

The build finished in 41 seconds with 0 warnings.

</details>

<!-- demo-region:start -->
Template comment pairs fold in the editor. The start and end markers stay in the file.
<!-- demo-region:end -->

<!-- a lone note for the agent -->

## Progress

- [x] Tests pass :white_check_mark:
- [x] Changelog written
- [ ] Screenshots captured :warning:
- [ ] Marketplace entry

| Check | Status |
| --- | --- |
| Unit tests | PASS |
| Type check | done |
| Staging deploy | FAIL |
| Docs | in progress |

## Math

Inline $a^2 + b^2 = c^2$ and \(e^{i\pi} + 1 = 0\), or a block:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## Code

```diff
@@ -1,3 +1,3 @@
- const timeout = 1000;
+ const timeout = 5000;
  connect(timeout);
```

```ts
export async function release(version: string) {
  const notes = await readFile("release_notes.md", "utf8");
  return publish({ version, notes });
}
```

## Project layout

```
bb-plugin-md-editor/
├── app.tsx          # file opener and header
├── rich.tsx         # editor, toolbar, code blocks
├── md-extensions.ts # agent Markdown syntax
└── README.md        // docs
```

## Solution map

```
┌──────────────────────────┐
│ H1: Release checklist    │
│ Who this is for          │
└──────────────────────────┘
              ↓
┌──────────────────────────┐
│ Layer 2: Checks          │
│ - Tests and typecheck    │
└──────────────────────────┘
```

## Query matrix

```
CANONICAL
"one page"
        ↓
    ┌───┴───────────┐
    ↓               ↓
Variant A       Variant B
(dative)        (genitive)
    └───┬───────────┘
        ↓
    /page
```

## Release flow

```mermaid
flowchart LR
  A[Agent writes notes] --> B[Markdown PRO]
  B --> C{Tests pass?}
  C -->|yes| D[Publish]
  C -->|no| E[Fix and retry]
```

<!-- agent note: keep this comment on save -->

Tracked in thread thr_demo0thread and task REL-42. See the footnote[^1].

[^1]: Footnotes render at the bottom and link back from the text.

## Where to look next

- [Markdown editing](editor.md) — editor modes and save lifecycle.
- [Markdown rendering](rendering.md) — supported custom syntax and diagram parsing.
