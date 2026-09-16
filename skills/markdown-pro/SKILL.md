---
name: markdown-pro
description: Write Markdown files (.md reports, plans, checklists, docs) that render well in the Markdown PRO editor — callouts, collapsible details, Mermaid, LaTeX, directory trees, task lists, status tables, footnotes and YAML properties. Use when creating or restructuring a Markdown document for the user to read or edit in BB.
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
- Long logs or details: `<details>` with `<summary>` and a blank line before and after the Markdown inside.
- Task lists `- [ ]` / `- [x]` show a progress counter. Do not mix task items and plain bullets in one list.
- Footnotes: `text[^1]` and `[^1]: note` at the end.

## Status and references

- Status words PASS, FAIL, DONE, TODO, WIP, BLOCKED, SKIPPED and ✅ ❌ ⚠️ render as colored badges; a table cell containing only a status (also `done`, `in progress`, `готово`, `ошибка`) becomes a badge.
- BB thread ids (`thr_…`) and task keys (`ABC-12`) become clickable links. Write them plainly, not in backticks.
- Link files relative to the document (`[plan](../plan.md)`, `src/app.ts:42`); links open on the same machine.

## Code, diagrams, math

- Fence code with a language (` ```ts `, ` ```php `, ` ```diff `). `diff` highlights added/removed lines; JSON gets a Format button.
- Directory trees: a fenced block (language `tree` or none) using `├──`, `└──`, `│`; add comments after `#` or `//`.
- Diagrams: ` ```mermaid ` (flowchart, sequenceDiagram, gantt, classDiagram, stateDiagram-v2, erDiagram, mindmap, pie, timeline). Flowcharts are editable by right-click, so use short node ids (`A`, `B1`) and put labels in brackets: `A[Start] --> B{Check?}`.
- Math: inline `$x^2$` or `\(x^2\)`, block `$$ … $$` or `\[ … \]` on their own lines. A lone `$5` is not math.

## Inline

`==highlight==`, `<kbd>Cmd</kbd>`, `H<sub>2</sub>O`, `x<sup>2</sup>`, emoji shortcodes like `:warning:`. Raw HTML blocks and `<!-- comments -->` are preserved but shown as source, so use them sparingly.

## Avoid

- Mixing a task item into a plain bullet list (it splits into two lists on save).
- `__word__` for emphasis in running text; use `**word**`.
- Hard-wrapping paragraphs at a fixed width; write one line per paragraph.
