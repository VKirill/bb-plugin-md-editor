---
name: markdown-pro
description: Write Markdown files (.md reports, plans, checklists, docs) that render well in the Markdown PRO editor — callouts, collapsible details, Mermaid, LaTeX, directory trees, ASCII box maps, task lists, status tables, footnotes, YAML properties, and foldable HTML template regions (`<!-- name:start -->` / `<!-- name:end -->`). Use when creating or restructuring a Markdown document for the user to read or edit in BB.
---

# Markdown PRO

The user opens `.md` files in BB with Markdown PRO: a formatted, editable view. Everything below renders visually and is saved back byte-for-byte, so prefer these constructs over ad-hoc formatting.

## Document header

Start longer documents with YAML front matter. `title`, `status`, `owner`/`author`, `date`/`updated`/`created` and `tags` render as a properties card; other keys appear as a key/value list.

```markdown
---
title: Release plan
status: in progress   # done / blocked / draft render as colored badges
owner: agent
updated: 2026-09-16
tags: [release, backend]
---
```

## Structure

- Headings `#`–`###` feed the Contents menu. Keep one `#` title.
- Callouts: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` (also SUCCESS, DANGER, BUG, QUESTION, EXAMPLE). Optional title after the marker; `[!TIP]-` starts collapsed.
- Long logs or details the reader should open: `<details>` with `<summary>` and a blank line before and after the Markdown inside.
- Machine-owned or generated slices (injected rules, plugin banners, replaceable packs): paired HTML comments — see Template regions below. Prefer that over a second `<details>` when another tool must find the same start/end later.
- Task lists `- [ ]` / `- [x]` show a progress counter. Do not mix task items and plain bullets in one list.
- Footnotes: `text[^1]` and `[^1]: note` at the end.

## Status and references

- Status words PASS, FAIL, DONE, TODO, WIP, BLOCKED, SKIPPED and ✅ ❌ ⚠️ render as colored badges; a table cell containing only a status (also `done`, `in progress`, `готово`, `ошибка`) becomes a badge.
- BB thread ids (`thr_…`) and task keys (`ABC-12`) become clickable links. Write them plainly, not in backticks.
- Link files relative to the document (`[plan](../plan.md)`, `src/app.ts:42`); links open on the same machine.
- A chat message is not a document, so nothing is relative to: BB resolves the path from the thread's root — its Git root, else the section folder. Give the whole path from that root (`docs/operating-model.md`, not `operating-model.md`), keep it whole on repeat mentions, and never reuse a path that is only valid inside a skill file (`references/memory.md`). A file outside that root has no working relative form — link it absolutely.

## Code, diagrams, math

- Fence code with a language (` ```ts `, ` ```php `, ` ```diff `). `diff` highlights added/removed lines; JSON gets a Format button.
- Directory trees: a fenced block (language `tree` or none) using `├──`, `└──`, `│`; add comments after `#` or `//`.
- ASCII box maps (solution maps, layered schemes): draw them with `┌─┐` / `│ │` / `└─┘` and arrows such as `↓`. Split–join maps (`┌───┴───┐` … `└───┬───┘`) render as a root, side-by-side branches and a merge. Leave them unfenced or fence with no language / `ascii`. Do not convert these into Mermaid unless the user asks.
- Diagrams: ` ```mermaid ` (flowchart, sequenceDiagram, gantt, classDiagram, stateDiagram-v2, erDiagram, mindmap, pie, timeline). Flowcharts are editable by right-click, so use short node ids (`A`, `B1`) and put labels in brackets: `A[Start] --> B{Check?}`.
- Math: inline `$x^2$` or `\(x^2\)`, block `$$ … $$` or `\[ … \]` on their own lines. A lone `$5` is not math.

## Template regions

Use paired HTML comments when a block has a stable identity for a plugin, generator, or later rewrite. Markdown PRO shows the pair as a foldable **Template** region; the comments stay in the file unchanged. Collapse is editor-only.

Preferred form (same key on both lines):

```markdown
<!-- my-plugin:pack:start -->
# Rules for this slice

Body is normal Markdown. Another tool can replace everything between the two comments.
<!-- my-plugin:pack:end -->
```

Also recognized: `<!-- BEGIN name -->` / `<!-- END name -->` and `<!-- #region name -->` / `<!-- #endregion -->`.

- You may introduce a new pair with a kebab-case key (`owner:purpose`) when you own the slice.
- Keep existing markers byte-for-byte (`<!-- bb-project-folders:agents:start -->` and its matching `:end`). Do not rename, wrap, or “pretty-print” them.
- A lone `<!-- note -->` is a compact marker for a one-line hint. Do not invent a `:start` without a matching `:end`.
- Reader-facing expand/collapse still uses `<details>`, not these comments.

## Inline

`==highlight==`, `<kbd>Cmd</kbd>`, `H<sub>2</sub>O`, `x<sup>2</sup>`, emoji shortcodes like `:warning:`. Other raw HTML blocks stay as source.

## Avoid

- Mixing a task item into a plain bullet list (it splits into two lists on save).
- `__word__` for emphasis in running text; use `**word**`.
- Hard-wrapping paragraphs at a fixed width; write one line per paragraph.
